#!/usr/bin/env node
/**
 * Starter verification.
 *
 * assets/starter/ is described as a verified working implementation, so the claim
 * needs a check that fails loudly when it stops being true. This drives the starter
 * headlessly through the three states that matter and asserts each one:
 *
 *   - a visible tab mounts the scene
 *   - prefers-reduced-motion takes the static path and never mounts
 *   - a page loaded in a BACKGROUND tab does not render while hidden, and does mount
 *     once the visitor switches to it
 *
 * That last case is here because it regressed once: the mount gate waited on
 * requestIdleCallback, which Chrome defers indefinitely in a hidden tab without
 * honouring its timeout, so a cmd-clicked link sat on the poster forever with no
 * error and no skip reason.
 *
 * Usage:
 *   cd assets/starter && python3 -m http.server 8000
 *   node scripts/verify_starter.mjs            # exits non-zero on any failure
 *
 * Requires: npm i puppeteer
 */

import puppeteer from 'puppeteer';

const URL_BASE = 'http://localhost:8000';

async function run(label, { url, reducedMotion = false, startHidden = false }) {
    // CI runners have no GPU and no user namespace for Chrome's sandbox, so WebGL has to
  // come from SwiftShader and the sandbox has to be off or the browser dies at launch.
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--enable-unsafe-swiftshader',
      '--use-gl=angle',
      '--use-angle=swiftshader',
    ],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  if (reducedMotion) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);

  const failed = [];
  page.on('requestfailed', r => failed.push(r.url()));
  page.on('response', r => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });

  if (startHidden) {
    // Make the page believe it loaded in a background tab, the case that used to stall.
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.__hidden ?? true });
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (window.__hidden ?? true) ? 'hidden' : 'visible' });
    });
  }

  await page.goto(url, { waitUntil: 'networkidle2' });

  if (startHidden) {
    await new Promise(r => setTimeout(r, 1500));
    const beforeReveal = await page.evaluate(() => {
      const c = document.querySelector('canvas');
      return !!(c && c.width > 300);
    });
    // Now "switch to the tab".
    await page.evaluate(() => { window.__hidden = false; document.dispatchEvent(new Event('visibilitychange')); });
    await new Promise(r => setTimeout(r, 4000));
    const afterReveal = await page.evaluate(() => {
      const c = document.querySelector('canvas');
      return !!(c && c.width > 300);
    });
    console.log(`${label}: mounted-while-hidden=${beforeReveal} (should be false), mounted-after-reveal=${afterReveal} (should be true)`);
    await browser.close();
    return afterReveal && !beforeReveal;
  }

  await new Promise(r => setTimeout(r, 4000));
  const state = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    return {
      canvas: c ? `${c.width}x${c.height}` : 'none',
      mounted: !!(c && c.width > 300),
      skipped: document.documentElement.dataset.sceneSkipped ?? null,
      brokenImages: [...document.images].filter(i => i.complete && i.naturalWidth === 0).map(i => i.getAttribute('src')),
      headingVisible: !!document.querySelector('h1')?.innerText?.trim(),
    };
  });
  console.log(`${label}:`, JSON.stringify(state), failed.length ? `\n   failed requests: ${[...new Set(failed)].join(', ')}` : '');
  await browser.close();
  return state;
}

const normal  = await run('visible tab   ', { url: `${URL_BASE}/?tier=high` });
const reduced = await run('reduced-motion', { url: `${URL_BASE}/?tier=high`, reducedMotion: true });
const hidden  = await run('background tab', { url: `${URL_BASE}/?tier=high`, startHidden: true });

console.log('\n--- verdict ---');
console.log('scene mounts when visible:      ', normal.mounted ? 'PASS' : 'FAIL');
console.log('reduced-motion takes static path:', reduced.skipped === 'reduced-motion' ? 'PASS' : `FAIL (${reduced.skipped})`);
console.log('background tab mounts on reveal: ', hidden ? 'PASS' : 'FAIL');
console.log('no broken images:               ', normal.brokenImages.length === 0 ? 'PASS' : `FAIL (${normal.brokenImages.join(', ')})`);

const ok = normal.mounted
  && reduced.skipped === 'reduced-motion'
  && hidden
  && normal.brokenImages.length === 0;
process.exit(ok ? 0 : 1);
