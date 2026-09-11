#!/usr/bin/env node
/**
 * Site verification — gates the deploy.
 *
 * The page claims it is complete in every state a visitor can get. This drives the
 * built site headlessly through each of those states and fails the build if any claim
 * stops being true:
 *
 *   - a visible tab mounts the scene, within the draw-call budget, with no errors
 *   - the LCP element is never the canvas
 *   - reduced motion takes the still path, never mounts, and still shows a poster
 *   - no WebGL takes the poster path with the full content
 *   - JavaScript off: every section, heading and word is still there and visible
 *   - a background tab stays dark while hidden and mounts on reveal
 *   - the fallback switcher really tears the scene down and brings it back
 *   - the static path swaps to the right still per section
 *   - the first-visit payload, gzipped, fits the 1.5 MB brand-hero budget
 *   - nothing 404s, anywhere
 *
 * Usage:  node site/verify.mjs            (after node site/build.mjs --posters)
 * Requires: npm i puppeteer
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import { serve } from './serve.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(here, 'dist');
const { url: BASE, close } = await serve(dist);

// CI runners have no GPU and no user namespace for Chrome's sandbox: WebGL comes from
// SwiftShader, and ?tier=high forces a render tier that software GL would otherwise floor.
const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
         '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
});

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function open({ query = '?tier=high', reducedMotion = false, noWebGL = false, noJS = false,
  startHidden = false, viewport = { width: 1440, height: 900 } } = {}) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  const failed = [];
  const errors = [];
  page.on('requestfailed', (r) => failed.push(r.url()));
  page.on('response', (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });
  page.on('pageerror', (e) => errors.push(e.message));
  if (noJS) await page.setJavaScriptEnabled(false);
  if (reducedMotion) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  if (noWebGL) {
    await page.evaluateOnNewDocument(() => {
      const orig = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
        return /webgl/i.test(type) ? null : orig.call(this, type, ...rest);
      };
    });
  }
  if (startHidden) {
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.__hidden ?? true });
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => ((window.__hidden ?? true) ? 'hidden' : 'visible') });
    });
  }
  // Headless throttles rAF when nothing is presented; a screencast keeps frames flowing.
  const cdp = await page.target().createCDPSession();
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 5, everyNthFrame: 4 });
  cdp.on('Page.screencastFrame', ({ sessionId }) => cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {}));
  await page.goto(`${BASE}/${query}`, { waitUntil: noJS ? 'domcontentloaded' : 'load' });
  return { page, failed, errors };
}

const until = async (page, fn, ms = 15000) => {
  const t = Date.now();
  while (Date.now() - t < ms) {
    if (await page.evaluate(fn).catch(() => false)) return true;
    await wait(250);
  }
  return false;
};

const canvasShowing = () => {
  const c = document.querySelector('#scene canvas');
  return !!c && c.width > 300 && parseFloat(getComputedStyle(c).opacity) > 0.5;
};

try {
  // 1 — visible tab ------------------------------------------------------------
  {
    const { page, failed, errors } = await open();
    const mounted = await until(page, () => window.__site?.path === 'scene');
    await wait(2500);
    const s = await page.evaluate(() => window.__site.stats());
    check('scene mounts in a visible tab', mounted && await page.evaluate(canvasShowing));
    check('draw calls within the mobile budget', !!s && s.calls > 0 && s.calls <= 50, s ? `${s.calls} calls, ${s.triangles} triangles` : 'no stats');
    const lcp = await page.evaluate(() => new Promise((resolve) => {
      new PerformanceObserver((l) => { const e = l.getEntries().at(-1); resolve(e?.element?.tagName ?? e?.url ?? 'none'); })
        .observe({ type: 'largest-contentful-paint', buffered: true });
      setTimeout(() => resolve('none'), 1500);
    }));
    check('LCP element is not the canvas', !/canvas/i.test(lcp), lcp);

    // Scroll the whole page: every station must be reachable without errors.
    await page.evaluate(async () => {
      document.documentElement.style.scrollBehavior = 'auto';
      const h = document.documentElement.scrollHeight;
      for (let y = 0; y < h; y += innerHeight / 2) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); }
    });
    // The camera is damped, so give it time to glide the rest of the way.
    const reached = await until(page, () => window.__site.stats()?.station === 'install', 10000);
    const bottom = await page.evaluate(() => window.__site.stats()?.station);
    check('camera reaches the last station', reached, bottom);
    check('no JavaScript errors while scrolling', errors.length === 0, errors[0]);
    check('no failed requests (scene path)', failed.length === 0, failed[0]);
    await page.close();
  }

  // 2 — reduced motion -----------------------------------------------------------
  {
    const { page, failed } = await open({ reducedMotion: true });
    await wait(3500);
    const st = await page.evaluate(() => ({
      path: window.__site.path, reason: window.__site.reason,
      poster: document.querySelector('[data-poster] img').naturalWidth,
    }));
    check('reduced motion takes the static path', st.path === 'static' && st.reason === 'reduced-motion', `${st.path}/${st.reason}`);
    check('reduced motion never shows a canvas', !(await page.evaluate(canvasShowing)));
    check('reduced motion shows the poster', st.poster > 0);
    // The still per section — scroll to the fallback phase and expect its still.
    await page.evaluate(() => document.getElementById('p5').scrollIntoView({ block: 'center' }));
    const still = await until(page, () => {
      const on = document.querySelector('.still.on img');
      return on && on.complete && on.naturalWidth > 0 && /fallback/.test(on.currentSrc);
    }, 6000);
    check('static path swaps to the section\'s still', still);
    check('no failed requests (reduced motion)', failed.length === 0, failed[0]);
    await page.close();
  }

  // 3 — no WebGL -------------------------------------------------------------------
  {
    const { page } = await open({ noWebGL: true, query: '' });
    await wait(3000);
    const st = await page.evaluate(() => ({
      path: window.__site.path, reason: window.__site.reason,
      poster: document.querySelector('[data-poster] img').naturalWidth,
      words: document.body.innerText.split(/\s+/).length,
    }));
    check('no WebGL takes the poster path', st.path === 'static' && st.reason === 'no-webgl' && st.poster > 0, `${st.reason}, poster ${st.poster}px`);
    check('no WebGL keeps the full content', st.words > 1200, `${st.words} words`);
    await page.close();
  }

  // 4 — JavaScript off -------------------------------------------------------------
  {
    const { page } = await open({ noJS: true });
    await wait(800);
    const st = await page.evaluate(() => {
      const hidden = [...document.querySelectorAll('h1, h2, p, li')].filter((el) => {
        const cs = getComputedStyle(el);
        return cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.5;
      }).length;
      return {
        words: document.body.innerText.split(/\s+/).length,
        h2: document.querySelectorAll('h2').length,
        hidden,
        noscript: !!document.querySelector('noscript'),
      };
    });
    check('JavaScript off: full content present', st.words > 1200 && st.h2 >= 14, `${st.words} words, ${st.h2} h2`);
    check('JavaScript off: nothing left invisible by reveal animations', st.hidden === 0, `${st.hidden} hidden`);
    await page.close();
  }

  // 5 — background tab ---------------------------------------------------------------
  {
    const { page } = await open({ startHidden: true });
    await wait(2500);
    const before = await page.evaluate(() => window.__site.path === 'scene');
    await page.evaluate(() => { window.__hidden = false; document.dispatchEvent(new Event('visibilitychange')); });
    const after = await until(page, () => window.__site.path === 'scene', 12000);
    check('background tab stays dark while hidden', !before);
    check('background tab mounts on reveal', after);
    await page.close();
  }

  // 6 — the switcher ------------------------------------------------------------------
  {
    const { page, errors } = await open();
    await until(page, () => window.__site?.path === 'scene');
    await page.evaluate(() => document.getElementById('try').scrollIntoView());
    await page.click('.switch [data-mode="poster"]');
    await wait(800);
    const poster = await page.evaluate(() => ({ path: window.__site.path, canvas: !!document.querySelector('#scene canvas') }));
    check('switcher: poster tears the scene down', poster.path === 'static' && !poster.canvas);
    await page.click('.switch [data-mode="scene"]');
    const back = await until(page, () => window.__site.path === 'scene', 12000);
    check('switcher: scene comes back', back);
    await page.click('.switch [data-mode="raw"]');
    await wait(400);
    const raw = await page.evaluate(() => [...document.styleSheets].every((s) => s.disabled));
    check('switcher: raw HTML disables every stylesheet', raw);
    await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => /Restore the design/.test(b.textContent)).click());
    const restored = await until(page, () => [...document.styleSheets].every((s) => !s.disabled) && window.__site.path === 'scene', 12000);
    check('switcher: restore brings the design and scene back', restored);
    await page.click('.motion');
    await wait(600);
    const motionOff = await page.evaluate(() => ({ path: window.__site.path, stored: localStorage.getItem('rv-motion'), attr: document.documentElement.dataset.motion }));
    check('motion toggle turns the scene off and remembers it', motionOff.path === 'static' && motionOff.stored === 'off' && motionOff.attr === 'off');
    await page.reload({ waitUntil: 'load' });
    await wait(2500);
    const remembered = await page.evaluate(() => window.__site.path === 'static' && window.__site.want === 'still');
    check('motion preference survives a reload', remembered);
    await page.evaluate(() => localStorage.removeItem('rv-motion'));
    check('no JavaScript errors in the switcher', errors.length === 0, errors[0]);
    await page.close();
  }

  // 7 — phone viewport ------------------------------------------------------------------
  {
    const { page, errors } = await open({ query: '?tier=medium', viewport: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } });
    const mounted = await until(page, () => window.__site?.path === 'scene');
    const overflow = await page.evaluate(() => {
      const w = document.documentElement.clientWidth;
      return [...document.querySelectorAll('main *')].filter((el) => {
        if (el.closest('pre, .scroll-x')) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.right > w + 1;
      }).map((el) => el.tagName + '.' + el.className).slice(0, 3);
    });
    check('phone: scene mounts', mounted);
    check('phone: nothing overflows the viewport', overflow.length === 0, overflow.join(', '));
    check('phone: no JavaScript errors', errors.length === 0, errors[0]);
    await page.close();
  }

  // 8 — payload budget -------------------------------------------------------------------
  {
    const html = fs.readFileSync(path.join(dist, 'index.html'));
    const gz = (buf) => zlib.gzipSync(buf, { level: 9 }).length;
    const js = fs.readdirSync(path.join(dist, 'src'), { recursive: true })
      .filter((f) => f.endsWith('.js')).map((f) => fs.readFileSync(path.join(dist, 'src', f)));
    const fonts = fs.readdirSync(path.join(dist, 'fonts')).filter((f) => f.endsWith('.woff2'))
      .map((f) => fs.statSync(path.join(dist, 'fonts', f)).size);
    const poster = fs.statSync(path.join(dist, 'posters/hero.avif')).size;
    const total = gz(html) + js.reduce((a, b) => a + gz(b), 0) + fonts.reduce((a, b) => a + b, 0) + poster;
    const kb = (b) => `${(b / 1024).toFixed(0)} KB`;
    check('first visit fits the 1.5 MB brand-hero budget', total <= 1.5 * 1024 * 1024,
      `${kb(total)} — html ${kb(gz(html))}, js ${kb(js.reduce((a, b) => a + gz(b), 0))}, fonts ${kb(fonts.reduce((a, b) => a + b, 0))}, poster ${kb(poster)}`);
  }
} finally {
  await browser.close();
  close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
