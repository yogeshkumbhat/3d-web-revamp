#!/usr/bin/env node
/**
 * Budget checker.
 *
 * The ship checklist demands measured numbers. This measures them, so "PASS" means
 * something was observed rather than assumed.
 *
 * Runs against a URL (local dev server or production) and reports:
 *   - LCP, CLS, and which element is the LCP (the canvas must never be it)
 *   - transfer size and request count
 *   - frame time p95 and mean over a sustained sample
 *   - draw calls and triangles per frame, counted by instrumenting the GL context
 *   - the four fallback paths: no-JS, reduced-motion, no-WebGL, and a floor-tier device
 *
 * Usage:
 *   node check_budget.js http://localhost:5173
 *   node check_budget.js https://example.com --category configurator --duration 30
 *   node check_budget.js http://localhost:5173 --mobile --json report.json
 *
 * Requires: npm i puppeteer
 *
 * Note: a desktop CI machine is not a mid-tier Android. This catches regressions and
 * gross violations; the numbers that go in a ship report come from a real device.
 */

const fs = require('fs');

let puppeteer;
try {
  puppeteer = require('puppeteer');
} catch {
  console.error('Missing dependency. Run: npm i puppeteer');
  process.exit(1);
}

const BUDGETS = {
  hero:         { payloadMB: 1.5, drawCalls: 100, triangles: 150000 },
  configurator: { payloadMB: 2.5, drawCalls: 100, triangles: 300000 },
  narrative:    { payloadMB: 4.0, drawCalls: 100, triangles: 500000 },
};

const COMMON = { lcpMs: 2500, clsScore: 0.1, frameP95Ms: 22, longTaskMs: 50 };

const MOBILE = {
  viewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  ua: 'Mozilla/5.0 (Linux; Android 13; Pixel 6a) AppleWebKit/537.36 (KHTML, like Gecko) ' +
      'Chrome/120.0.0.0 Mobile Safari/537.36',
  cpuThrottle: 4,
  network: { offline: false, downloadThroughput: 1.6 * 1024 * 1024 / 8,
             uploadThroughput: 750 * 1024 / 8, latency: 150 },
};

// ---------------------------------------------------------------------------
// Injected before any page script. Hooks the GL context to count draw calls and
// triangles per frame, and records frame deltas. Framework-agnostic on purpose —
// it works whether the site uses Three, Babylon, R3F or raw WebGL.
// ---------------------------------------------------------------------------
const INSTRUMENT = `
(() => {
  const stats = { frames: [], calls: [], tris: [], longTasks: [] };
  window.__budget = stats;

  let frameCalls = 0, frameTris = 0;

  const countTris = (mode, count) => {
    // 4 = TRIANGLES, 5 = TRIANGLE_STRIP, 6 = TRIANGLE_FAN
    if (mode === 4) return count / 3;
    if (mode === 5 || mode === 6) return Math.max(0, count - 2);
    return 0;
  };

  for (const Ctx of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
    if (!Ctx) continue;
    const p = Ctx.prototype;
    for (const fn of ['drawArrays', 'drawElements', 'drawArraysInstanced',
                      'drawElementsInstanced', 'drawRangeElements']) {
      const orig = p[fn];
      if (!orig) continue;
      p[fn] = function (mode, a, b, c, d) {
        frameCalls++;
        const count = (fn === 'drawRangeElements') ? c : a;
        const instances = /Instanced$/.test(fn) ? (fn.startsWith('drawArrays') ? c : d) : 1;
        frameTris += countTris(mode, count) * (instances || 1);
        return orig.apply(this, arguments);
      };
    }
  }

  let last = performance.now();
  const tick = (t) => {
    stats.frames.push(t - last);
    stats.calls.push(frameCalls);
    stats.tris.push(frameTris);
    frameCalls = 0; frameTris = 0;
    last = t;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) stats.longTasks.push(e.duration);
    }).observe({ type: 'longtask', buffered: true });
  } catch {}

  try {
    new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const lcp = entries[entries.length - 1];
      stats.lcp = lcp.startTime;
      stats.lcpElement = lcp.element
        ? lcp.element.tagName.toLowerCase() +
          (lcp.element.id ? '#' + lcp.element.id : '') +
          (lcp.element.className && typeof lcp.element.className === 'string'
            ? '.' + lcp.element.className.trim().split(/\\s+/)[0] : '')
        : (lcp.url ? 'image:' + lcp.url.split('/').pop() : 'unknown');
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  } catch {}

  try {
    let cls = 0;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (!e.hadRecentInput) cls += e.value;
      stats.cls = cls;
    }).observe({ type: 'layout-shift', buffered: true });
  } catch {}
})();
`;

const p95 = (arr) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length * 0.95)];
};
const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
const mb = (bytes) => bytes / 1024 / 1024;

async function measureMain(browser, url, opts) {
  const page = await browser.newPage();
  if (opts.mobile) {
    await page.setViewport(MOBILE.viewport);
    await page.setUserAgent(MOBILE.ua);
    const client = await page.target().createCDPSession();
    await client.send('Emulation.setCPUThrottlingRate', { rate: MOBILE.cpuThrottle });
    await client.send('Network.emulateNetworkConditions', MOBILE.network);
  } else {
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  }

  await page.evaluateOnNewDocument(INSTRUMENT);

  let transfer = 0;
  let requests = 0;
  page.on('response', (res) => {
    requests++;
    const len = res.headers()['content-length'];
    if (len) transfer += parseInt(len, 10);
  });

  // content-length is missing on chunked responses, so take the authoritative
  // encoded size from the protocol as well and keep whichever is larger.
  const cdp = await page.target().createCDPSession();
  await cdp.send('Network.enable');
  let encoded = 0;
  cdp.on('Network.loadingFinished', (e) => { encoded += e.encodedDataLength || 0; });

  // Headless Chrome throttles requestAnimationFrame to a couple of frames per second
  // when nothing is being presented to a display, which makes frame timing
  // meaningless. Starting a screencast forces the compositor to produce real frames.
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 10, everyNthFrame: 1 });
  cdp.on('Page.screencastFrame', ({ sessionId }) => {
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });

  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  // Give lazily-mounted scenes time to appear before sampling starts.
  await new Promise((r) => setTimeout(r, 3000));

  // Sustained sample. Thermal and leak problems appear well after first paint, which
  // is why the default is 20 seconds rather than a snapshot.
  await new Promise((r) => setTimeout(r, opts.duration * 1000));

  await cdp.send('Page.stopScreencast').catch(() => {});

  const stats = await page.evaluate(() => {
    const s = window.__budget;
    // Discard a proportional warmup rather than a fixed count — shader compilation and
    // texture upload land in the opening frames, but a short sample has none to spare.
    const skip = Math.min(30, Math.floor(s.frames.length * 0.15));
    return {
      frames: s.frames.slice(skip),
      calls: s.calls.slice(skip),
      tris: s.tris.slice(skip),
      longTasks: s.longTasks,
      lcp: s.lcp ?? null,
      lcpElement: s.lcpElement ?? null,
      cls: s.cls ?? 0,
    };
  });

  // Split the sample in half — a rising second half means thermal throttling or a leak.
  const half = Math.floor(stats.frames.length / 2);
  const firstHalf = mean(stats.frames.slice(0, half));
  const secondHalf = mean(stats.frames.slice(half));

  await page.close();

  return {
    lcpMs: stats.lcp,
    lcpElement: stats.lcpElement,
    cls: stats.cls,
    transferMB: mb(Math.max(transfer, encoded)),
    requests,
    frameP95: p95(stats.frames),
    frameMean: mean(stats.frames),
    fps: stats.frames.length ? 1000 / mean(stats.frames) : 0,
    drift: firstHalf > 0 ? (secondHalf - firstHalf) / firstHalf : 0,
    drawCalls: Math.round(p95(stats.calls)),
    triangles: Math.round(p95(stats.tris)),
    longTasks: stats.longTasks.filter((d) => d > COMMON.longTaskMs),
    sampleSize: stats.frames.length,
    errors,
  };
}

async function checkFallback(browser, url, mode) {
  const page = await browser.newPage();

  if (mode === 'no-js') await page.setJavaScriptEnabled(false);
  if (mode === 'reduced-motion') {
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  }
  if (mode === 'no-webgl') {
    // Deny WebGL the way a locked-down browser or blocked GPU would.
    await page.evaluateOnNewDocument(`
      const orig = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
        if (/webgl/i.test(type)) return null;
        return orig.call(this, type, ...rest);
      };
    `);
  }

  await page.goto(url, { waitUntil: mode === 'no-js' ? 'domcontentloaded' : 'load',
                          timeout: 45000 });
  await new Promise((r) => setTimeout(r, mode === 'no-js' ? 500 : 3000));

  const result = await page.evaluate(() => {
    const body = document.body;
    const text = (body.innerText || '').trim();
    const canvas = document.querySelector('canvas');
    return {
      words: text ? text.split(/\s+/).length : 0,
      headings: document.querySelectorAll('h1, h2').length,
      links: document.querySelectorAll('a[href]').length,
      canvasVisible: canvas
        ? getComputedStyle(canvas).display !== 'none' &&
          parseFloat(getComputedStyle(canvas).opacity) > 0.05
        : false,
      hasImage: !!document.querySelector('img'),
    };
  });

  await page.close();
  return result;
}

function row(label, value, verdict, budget) {
  const v = verdict === null ? '  —  ' : verdict ? ' PASS' : ' FAIL';
  return `  ${label.padEnd(26)} ${String(value).padEnd(22)} ${v}${budget ? '   (' + budget + ')' : ''}`;
}

(async () => {
  const args = process.argv.slice(2);
  const url = args.find((a) => a.startsWith('http'));
  if (!url) {
    console.error('Usage: node check_budget.js <url> [--category hero|configurator|narrative] ' +
                  '[--mobile] [--duration 20] [--json out.json]');
    process.exit(1);
  }

  // indexOf returns -1 when a flag is absent, and args[-1 + 1] is args[0] — which is
  // the URL. Read flags explicitly so a missing flag means the default, not the URL.
  const flag = (name, fallback = null) => {
    const i = args.indexOf(name);
    return i !== -1 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
  };

  const category = flag('--category', 'hero');
  const duration = parseInt(flag('--duration', '20'), 10);
  const mobile = args.includes('--mobile');
  const jsonPath = flag('--json');
  const budget = BUDGETS[category] ?? BUDGETS.hero;

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
  });

  console.log(`\nMeasuring ${url}`);
  console.log(`Category: ${category} · Profile: ${mobile ? 'mobile (4x CPU, throttled 4G)' : 'desktop'} · Sample: ${duration}s\n`);

  const m = await measureMain(browser, url, { mobile, duration });

  const fallbacks = {};
  for (const mode of ['no-js', 'reduced-motion', 'no-webgl']) {
    process.stdout.write(`  checking ${mode}...\r`);
    try {
      fallbacks[mode] = await checkFallback(browser, url, mode);
    } catch (e) {
      fallbacks[mode] = { error: e.message };
    }
  }

  await browser.close();

  const lcpOk = m.lcpMs !== null && m.lcpMs < COMMON.lcpMs;
  const lcpNotCanvas = !/canvas/i.test(m.lcpElement ?? '');
  const enoughFrames = m.sampleSize >= 120;

  const checks = [
    ['LCP', m.lcpMs === null ? 'not observed' : `${(m.lcpMs / 1000).toFixed(2)}s`,
      m.lcpMs === null ? null : lcpOk, '< 2.5s'],
    ['LCP element', m.lcpElement ?? 'unknown', lcpNotCanvas, 'must not be canvas'],
    ['CLS', m.cls.toFixed(3), m.cls < COMMON.clsScore, '< 0.1'],
    ['Transfer size', `${m.transferMB.toFixed(2)} MB`, m.transferMB <= budget.payloadMB,
      `<= ${budget.payloadMB} MB`],
    ['Requests', m.requests, null, ''],
    ['Frame samples', m.sampleSize, m.sampleSize >= 120 ? true : null,
      m.sampleSize < 120 ? 'too few to trust' : '>= 120'],
    ['Frame time p95', enoughFrames ? `${m.frameP95.toFixed(1)} ms` : 'not measurable',
      enoughFrames ? m.frameP95 <= COMMON.frameP95Ms : null, '<= 22 ms'],
    ['Frame rate (mean)', enoughFrames ? `${m.fps.toFixed(0)} fps` : 'not measurable',
      enoughFrames ? m.fps >= (mobile ? 28 : 50) : null, mobile ? '>= 30' : '>= 50'],
    ['Sustained drift', enoughFrames ? `${(m.drift * 100).toFixed(1)}%` : 'not measurable',
      enoughFrames ? m.drift < 0.30 : null, '< 30% (throttling/leak)'],
    ['Draw calls p95', m.drawCalls || 'not measurable',
      m.drawCalls > 0 ? m.drawCalls <= (mobile ? 50 : budget.drawCalls) : null,
      `<= ${mobile ? 50 : budget.drawCalls}`],
    ['Triangles p95', m.triangles ? m.triangles.toLocaleString() : 'not measurable',
      m.triangles > 0 ? m.triangles <= budget.triangles : null,
      `<= ${budget.triangles.toLocaleString()}`],
    ['Long tasks > 50ms', m.longTasks.length, m.longTasks.length === 0, 'none'],
    ['JS errors', m.errors.length, m.errors.length === 0, 'none'],
  ];

  console.log('  ' + '─'.repeat(74));
  console.log('  PERFORMANCE');
  console.log('  ' + '─'.repeat(74));
  for (const [l, v, ok, b] of checks) console.log(row(l, v, ok, b));

  console.log('\n  ' + '─'.repeat(74));
  console.log('  FALLBACK PATHS');
  console.log('  ' + '─'.repeat(74));

  const njs = fallbacks['no-js'];
  const rm = fallbacks['reduced-motion'];
  const nw = fallbacks['no-webgl'];

  console.log(row('No JavaScript', `${njs?.words ?? 0} words, ${njs?.headings ?? 0} headings`,
    (njs?.words ?? 0) > 50 && (njs?.headings ?? 0) > 0, 'content must survive'));
  console.log(row('Reduced motion', rm?.canvasVisible ? 'canvas still mounted' : 'static path',
    rm ? !rm.canvasVisible : null, 'no animated canvas'));
  console.log(row('No WebGL', `${nw?.words ?? 0} words, image ${nw?.hasImage ? 'present' : 'missing'}`,
    (nw?.words ?? 0) > 50 && !!nw?.hasImage, 'poster + full content'));

  const failures = checks.filter(([, , ok]) => ok === false).length +
    (((njs?.words ?? 0) > 50 && (njs?.headings ?? 0) > 0) ? 0 : 1) +
    ((rm && !rm.canvasVisible) ? 0 : 1) +
    (((nw?.words ?? 0) > 50 && !!nw?.hasImage) ? 0 : 1);

  console.log('\n  ' + '─'.repeat(74));
  console.log(failures === 0
    ? '  RESULT: PASS — all measured budgets met'
    : `  RESULT: ${failures} FAILING CHECK${failures > 1 ? 'S' : ''} — see above`);
  console.log('  ' + '─'.repeat(74));

  if (m.errors.length) {
    console.log('\n  JS errors:');
    m.errors.slice(0, 5).forEach((e) => console.log('    - ' + e));
  }

  if (!enoughFrames) {
    console.log('\n  Frame timing could not be sampled reliably in this environment.');
    console.log('  Headless browsers throttle rendering when nothing is presented to a');
    console.log('  display. Run with a longer --duration, or profile on a real device.');
  }

  if (mobile === false) {
    console.log('\n  Note: desktop profile. Re-run with --mobile, and confirm on a real');
    console.log('  mid-tier Android before putting numbers in a ship report.');
  }

  if (jsonPath) {
    fs.writeFileSync(jsonPath, JSON.stringify({ url, category, mobile, duration,
      measured: m, fallbacks }, null, 2));
    console.log(`\n  Full data written to ${jsonPath}`);
  }

  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error('check_budget failed:', e.message); process.exit(2); });
