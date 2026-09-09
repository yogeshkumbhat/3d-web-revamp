#!/usr/bin/env node
/**
 * Poster capture.
 *
 * The poster is the LCP element and the fallback every non-WebGL visitor sees, so it
 * has to match the scene. Hand-exporting it means it drifts the moment the scene
 * changes. This renders it from the running page, at whatever resolutions you need,
 * in AVIF/WebP/JPEG.
 *
 * Wire it into the build so the poster can never go stale.
 *
 * Usage:
 *   node capture_poster.js http://localhost:5173 --out ./public
 *   node capture_poster.js http://localhost:5173 --selector "#hero" --wait 6000
 *   node capture_poster.js http://localhost:5173 --widths 1600,960,640
 *
 * Requires: npm i puppeteer sharp
 */

const fs = require('fs');
const path = require('path');

let puppeteer, sharp;
try {
  puppeteer = require('puppeteer');
} catch {
  console.error('Missing dependency. Run: npm i puppeteer sharp');
  process.exit(1);
}
try {
  sharp = require('sharp');
} catch {
  console.warn('sharp not installed — will emit PNG only. For AVIF/WebP: npm i sharp');
}

(async () => {
  const args = process.argv.slice(2);
  const url = args.find((a) => a.startsWith('http'));
  if (!url) {
    console.error('Usage: node capture_poster.js <url> [--selector "#hero"] [--out ./public] ' +
                  '[--widths 1600,960] [--wait 5000] [--tier high]');
    process.exit(1);
  }

  const flag = (name, fallback = null) => {
    const i = args.indexOf(name);
    return i !== -1 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
  };

  const selector = flag('--selector', '.scene-container');
  const outDir = flag('--out', './public');
  const widths = flag('--widths', '1600,960,640').split(',').map((n) => parseInt(n, 10));
  const wait = parseInt(flag('--wait', '5000'), 10);
  const tier = flag('--tier', 'high');
  const name = flag('--name', 'poster');

  fs.mkdirSync(outDir, { recursive: true });

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--hide-scrollbars'],
  });

  const page = await browser.newPage();

  // Render at the largest width with a 2x scale factor, then downsample. Rendering
  // once at high resolution and resizing gives cleaner edges than rendering small.
  const maxWidth = Math.max(...widths);
  const height = Math.round(maxWidth * 9 / 16);
  await page.setViewport({ width: maxWidth, height, deviceScaleFactor: 2 });

  // Force the highest tier so the poster shows the scene at its best — this image
  // stands in for the scene, so it should represent the good version of it.
  const target = url.includes('?') ? `${url}&tier=${tier}` : `${url}?tier=${tier}`;

  console.log(`Loading ${target}`);
  await page.goto(target, { waitUntil: 'load', timeout: 60000 });

  // Compositing has to be running for WebGL frames to be captured in headless.
  const cdp = await page.target().createCDPSession();
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 10, everyNthFrame: 1 });
  cdp.on('Page.screencastFrame', ({ sessionId }) =>
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {}));

  console.log(`Waiting ${wait}ms for the scene to settle...`);
  await new Promise((r) => setTimeout(r, wait));

  // Hide DOM content so the poster is the scene alone — the HTML layer renders on top
  // of it at runtime and would otherwise be baked in twice.
  await page.evaluate((sel) => {
    document.querySelectorAll('body > *').forEach((el) => {
      if (!el.matches(sel) && !el.contains(document.querySelector(sel))) {
        el.style.visibility = 'hidden';
      }
    });
    const container = document.querySelector(sel);
    if (container) {
      container.querySelectorAll('[data-poster]').forEach((p) => { p.style.display = 'none'; });
      const hero = container.closest('.hero') || container.parentElement;
      hero?.querySelectorAll('.hero-content').forEach((c) => { c.style.visibility = 'hidden'; });
    }
  }, selector);

  await new Promise((r) => setTimeout(r, 400));

  const element = await page.$(selector);
  if (!element) {
    console.error(`Selector not found: ${selector}`);
    await browser.close();
    process.exit(1);
  }

  const raw = await element.screenshot({ type: 'png', omitBackground: false });
  await cdp.send('Page.stopScreencast').catch(() => {});
  await browser.close();

  if (!sharp) {
    const out = path.join(outDir, `${name}.png`);
    fs.writeFileSync(out, raw);
    console.log(`Wrote ${out} (install sharp for AVIF/WebP/JPEG)`);
    return;
  }

  const written = [];
  for (const w of widths) {
    const suffix = w === Math.max(...widths) ? '' : `-${w}`;
    const base = sharp(raw).resize({ width: w, withoutEnlargement: true });

    const jobs = [
      ['avif', base.clone().avif({ quality: 55, effort: 6 })],
      ['webp', base.clone().webp({ quality: 78 })],
      ['jpg',  base.clone().jpeg({ quality: 82, mozjpeg: true })],
    ];

    for (const [ext, pipeline] of jobs) {
      const out = path.join(outDir, `${name}${suffix}.${ext}`);
      const info = await pipeline.toFile(out);
      written.push([out, info.size]);
    }
  }

  console.log('\nPoster written:');
  for (const [file, size] of written) {
    console.log(`  ${(size / 1024).toFixed(0).padStart(5)} KB  ${file}`);
  }

  const largest = Math.max(...written.map(([, s]) => s));
  if (largest > 300 * 1024) {
    console.log('\n  The largest poster is over 300KB. It is the LCP element — lower the');
    console.log('  AVIF quality or the max width before shipping it.');
  }

  console.log('\nReferenced from markup as:');
  console.log(`  <picture data-poster>
    <source srcset="${name}.avif" type="image/avif">
    <source srcset="${name}.webp" type="image/webp">
    <img src="${name}.jpg" alt="" width="${Math.max(...widths)}" height="${Math.round(Math.max(...widths) * 9 / 16)}" fetchpriority="high">
  </picture>`);
})().catch((e) => { console.error('capture_poster failed:', e.message); process.exit(1); });
