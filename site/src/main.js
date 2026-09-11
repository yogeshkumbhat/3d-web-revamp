/**
 * The enhancement layer. The page is complete before this runs; everything here is
 * optional, and a failure anywhere in it leaves a working site.
 *
 * Owns: which render path the visitor gets (scene, or one of the static paths), the
 * stills the static path shows per section, the page's own measurements, and the
 * small DOM behaviours — reveals, the phase rail, copy buttons, the motion toggle.
 *
 * Three.js is never imported here. It arrives in a separate chunk, and only once the
 * starter's mount gate has decided the scene is worth loading.
 */

import { mountWhenWorthwhile, prefersReducedMotion } from '../../assets/starter/mount.js';
import { stationFor } from './stations.js';

const root = document.documentElement;
root.classList.add('js');

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

const container = $('#scene');
const params = new URLSearchParams(location.search);
const pose = params.get('pose');           // build-time poster capture only

const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};
const MOTION_KEY = 'rv-motion';

// ---------------------------------------------------------------------------
// Render path
// ---------------------------------------------------------------------------

const REASONS = {
  'no-webgl': 'no WebGL',
  'reduced-motion': 'reduced motion',
  'floor-tier': 'low-power device',
  'load-error': 'scene failed to load',
  probe: 'frame rate too low',
  poster: 'no WebGL (simulated)',
  still: 'motion off',
  raw: 'raw HTML',
};

const site = {
  want: store.get(MOTION_KEY) === 'off' ? 'still' : 'scene',   // what the visitor asked for
  path: 'static',                                               // what they are getting
  reason: 'pending',
  handle: null,
  instance: null,
  generation: 0,
};
window.__site = {
  get path() { return site.path; },
  get reason() { return site.reason; },
  get want() { return site.want; },
  stats: () => site.instance?.stats?.() ?? null,
};

function ensureCanvas() {
  let canvas = $('canvas', container);
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    container.append(canvas);
  }
  return canvas;
}

// poster.js hides the poster once the scene reveals; bring it back when the scene goes.
function resetPoster() {
  const poster = $('[data-poster]', container);
  if (poster) {
    poster.style.visibility = 'visible';
    poster.style.opacity = '1';
  }
}

function teardownScene() {
  site.generation++;
  site.handle?.destroy();
  site.handle = null;
  site.instance = null;
  resetPoster();
}

function mountScene() {
  teardownScene();
  ensureCanvas();
  const gen = site.generation;
  site.reason = 'pending';
  site.handle = mountWhenWorthwhile({
    container,
    load: async (tier) => {
      const { init } = await import('./scene.js');
      const instance = await init(container, tier, { pose });
      // The visitor may have switched path while the chunk was downloading.
      if (gen !== site.generation) { instance.destroy(); return { destroy() {} }; }
      site.instance = instance;
      site.path = 'scene';
      site.reason = '';
      stills.stop();
      render();
      return instance;
    },
    onSkip: (why) => {
      if (gen !== site.generation) return;
      console.info(`[3d] static path — ${why}`);
      root.dataset.sceneSkipped = why;
      goStatic(why);
    },
  });
}

function goStatic(reason) {
  site.path = 'static';
  site.reason = reason;
  site.instance = null;
  stills.start();
  render();
}

function setWant(want) {
  const prev = site.want;
  site.want = want;
  root.dataset.motion = want === 'still' ? 'off' : 'on';
  if (want === 'scene' || want === 'still') store.set(MOTION_KEY, want === 'still' ? 'off' : 'on');

  if (prev === 'raw' && want !== 'raw') raw.off();

  if (want === 'scene') {
    mountScene();
  } else {
    teardownScene();
    goStatic(want);
    if (want === 'raw') raw.on();
  }
  render();
}

// Context loss destroys every GPU resource — rebuild, never reuse.
window.addEventListener('scene:needs-reinit', () => { if (site.want === 'scene') mountScene(); });
// The frame probe gave up: this device is better served by the stills.
window.addEventListener('scene:floor', () => { teardownScene(); goStatic('probe'); });

// ---------------------------------------------------------------------------
// Stills — the static path's scene. One pre-rendered frame per composition, chosen by
// the section in view, swapped (cross-faded at most) with no camera motion.
// ---------------------------------------------------------------------------

const stills = (() => {
  const SIZES = '(max-aspect-ratio: 16/9) 178vh, 100vw';
  const set = (name, ext) => `posters/${name}-640.${ext} 640w, posters/${name}-960.${ext} 960w, posters/${name}.${ext} 1600w`;
  const made = new Map();
  let marks = [];
  let active = 'hero';
  let running = false;

  const picture = (name) => {
    if (made.has(name)) return made.get(name);
    const pic = document.createElement('picture');
    pic.className = 'still';
    for (const [type, ext] of [['image/avif', 'avif'], ['image/webp', 'webp']]) {
      const s = document.createElement('source');
      s.type = type; s.sizes = SIZES; s.srcset = set(name, ext);
      pic.append(s);
    }
    const img = new Image(1600, 900);
    img.alt = ''; img.decoding = 'async'; img.sizes = SIZES; img.srcset = set(name, 'jpg'); img.src = `posters/${name}.jpg`;
    pic.append(img);
    container.insertBefore(pic, $('canvas', container));
    made.set(name, pic);
    return pic;
  };

  const measure = () => {
    marks = $$('[data-station]').map((el) => {
      const r = el.getBoundingClientRect();
      return { poster: stationFor(el.dataset.station).poster, y: r.top + scrollY + Math.min(r.height, innerHeight) / 2 };
    });
  };

  const update = () => {
    if (!running || !marks.length) return;
    const ref = scrollY + innerHeight / 2;
    let best = marks[0];
    for (const m of marks) if (Math.abs(m.y - ref) < Math.abs(best.y - ref)) best = m;
    if (best.poster === active) return;
    active = best.poster;
    for (const [name, pic] of made) if (name !== active) pic.classList.remove('on');
    if (active === 'hero') return;                      // the base poster is the hero
    const pic = picture(active);
    const img = $('img', pic);
    // Fade in only once decoded, and only if the visitor hasn't scrolled on meanwhile.
    (img.decode ? img.decode() : Promise.resolve()).catch(() => {}).then(() => {
      if (running && made.get(active) === pic) pic.classList.add('on');
    });
  };

  return {
    start() { running = true; measure(); active = null; update(); },
    stop() { running = false; active = 'hero'; for (const pic of made.values()) pic.classList.remove('on'); },
    update,
    measure,
  };
})();

// ---------------------------------------------------------------------------
// Raw HTML — the page with every style switched off. What a crawler reads.
// ---------------------------------------------------------------------------

const raw = (() => {
  let bar = null;
  const sheets = () => $$('style, link[rel="stylesheet"]');
  return {
    on() {
      sheets().forEach((s) => { if (s.sheet) s.sheet.disabled = true; });
      bar = document.createElement('div');
      bar.setAttribute('role', 'region');
      bar.setAttribute('aria-label', 'Raw HTML view');
      bar.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:99;display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap;padding:12px 14px;background:#07080a;color:#eef1f4;border:1px solid #7fd4ff;border-radius:12px;font:14px/1.4 system-ui,sans-serif';
      bar.innerHTML = '<span>Every style is off. This is the document a crawler or screen reader gets — nothing is missing.</span>';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = 'Restore the design';
      btn.style.cssText = 'padding:10px 16px;border-radius:999px;border:0;background:#7fd4ff;color:#04121a;font:600 14px system-ui,sans-serif;cursor:pointer';
      btn.addEventListener('click', () => setWant(store.get(MOTION_KEY) === 'off' ? 'still' : 'scene'));
      bar.append(btn);
      document.body.append(bar);
      $('#h-try').scrollIntoView();
      btn.focus({ preventScroll: true });
    },
    off() {
      sheets().forEach((s) => { if (s.sheet) s.sheet.disabled = false; });
      bar?.remove();
      bar = null;
      requestAnimationFrame(() => $('#try').scrollIntoView({ block: 'start' }));
    },
  };
})();

// ---------------------------------------------------------------------------
// Measurement — the page reporting on itself
// ---------------------------------------------------------------------------

const PEAR_BYTES = 24.8 * 1024 * 1024;
const perf = { lcp: null, lcpEl: null };

try {
  new PerformanceObserver((list) => {
    const e = list.getEntries().at(-1);
    perf.lcp = e.startTime;
    const el = e.element;
    perf.lcpEl = el ? el.tagName.toLowerCase() + (el.closest('[data-poster]') ? ' · poster' : el.closest('h1') || el.tagName === 'H1' ? ' · headline' : '') : 'image';
  }).observe({ type: 'largest-contentful-paint', buffered: true });
} catch { /* not supported — shown as unavailable */ }

function weight() {
  const nav = performance.getEntriesByType('navigation')[0];
  // transferSize is 0 for a cache hit; the compressed body size is the honest weight then.
  const size = (e) => e.transferSize || e.encodedBodySize || 0;
  let bytes = nav ? size(nav) : 0;
  let requests = nav ? 1 : 0;
  for (const r of performance.getEntriesByType('resource')) { bytes += size(r); requests++; }
  return { bytes, requests };
}

const fmtBytes = (b) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(2)} MB` : `${Math.round(b / 1024)} KB`);

function render() {
  const s = site.instance?.stats?.();
  const w = weight();
  const scene = site.path === 'scene' && s;

  // HUD
  const hud = $('.hud');
  hud.dataset.mode = scene ? 'scene' : 'static';
  $('[data-h="mode"]').textContent = scene ? 'Scene' : 'Static';
  $('[data-h="tier"]').textContent = scene ? `tier ${s.tier}` : (REASONS[site.reason] ?? 'loading');
  $('[data-h="fps"]').textContent = scene ? Math.round(s.fps) : '—';
  $('[data-h="calls"]').textContent = scene ? s.calls : 0;
  $('[data-h="kb"]').textContent = fmtBytes(w.bytes);

  // Measured section
  const ratio = w.bytes / PEAR_BYTES;
  $('[data-m="kb-vs"]').textContent = `${fmtBytes(w.bytes)} · ${ratio > 0 ? `1/${Math.round(1 / ratio)}` : '—'}`;
  $('[data-m="bar"]').style.width = `${Math.max(ratio * 100, 0.4)}%`;
  $('[data-m="kb"]').innerHTML = `${fmtBytes(w.bytes)}<small>${w.requests} requests · compressed</small>`;
  $('[data-m="lcp"]').innerHTML = perf.lcp == null
    ? '—<small>not reported by this browser</small>'
    : `${(perf.lcp / 1000).toFixed(2)} s<small>${perf.lcpEl} — never the canvas</small>`;
  $('[data-m="calls"]').innerHTML = scene
    ? `${s.calls}<small>${s.triangles.toLocaleString()} triangles · budget ≤ 50</small>`
    : `0<small>static path · ${REASONS[site.reason] ?? ''}</small>`;
  $('[data-m="p95"]').innerHTML = scene
    ? `${s.p95.toFixed(1)} ms<small>${Math.round(s.fps)} fps · tier ${s.tier} · budget ≤ 22 ms</small>`
    : '—<small>no frames to time: nothing is animating</small>';

  // Switcher
  const forced = site.want === 'scene' && site.path === 'static' && site.reason !== 'pending';
  for (const b of $$('.switch button')) {
    b.setAttribute('aria-pressed', String(b.dataset.mode === site.want));
  }
  const sceneBtn = $('.switch [data-mode="scene"]');
  const osReduced = prefersReducedMotion();
  sceneBtn.disabled = osReduced;
  $('.motion').setAttribute('aria-pressed', String(site.want !== 'still' && !osReduced));

  const note = $('[data-state]');
  const text = (() => {
    if (osReduced && site.want === 'scene') return 'Your system asks for reduced motion, so the scene stays off — the skill never overrides that setting. You are on the still path: same content, same order, no camera motion.';
    if (forced) return `The scene didn’t mount here (${REASONS[site.reason] ?? site.reason}), so you are on the static path — which is the complete page. That is the fallback working, not failing.`;
    switch (site.want) {
      // No live numbers here: this is an aria-live region, and a draw-call count that
      // changes with every scroll would be re-announced to screen readers endlessly.
      case 'scene': return scene ? `Full scene — quality tier “${s.tier}”. It sits on top of the poster and the HTML, and can be taken away at any time.` : 'Mounting the scene after first paint…';
      case 'poster': return 'Poster — what a browser without WebGL, or with a lost GPU context, gets. The stills are rendered from the scene at build time, so they always match it.';
      case 'still': return 'Still — reduced motion means no camera movement and no scroll-linked motion. Not the same journey, slower: stillness. Remembered for your next visit.';
      default: return '';
    }
  })();
  if (note.textContent !== text) note.textContent = text;
}

setInterval(() => { if (!document.hidden) render(); }, 700);

// ---------------------------------------------------------------------------
// DOM behaviours
// ---------------------------------------------------------------------------

// Reveals — added only now that JS is running, so a failed script never hides content.
if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
  $$('.rv').forEach((el) => io.observe(el));
} else {
  $$('.rv').forEach((el) => el.classList.add('in'));
}

// Phase rail — progress and the current phase, from cached offsets.
const rail = $('.rail');
const phases = $$('.phase');
let phaseTops = [];
const measurePhases = () => { phaseTops = phases.map((p) => p.getBoundingClientRect().top + scrollY); };
let scrollQueued = false;
const onScroll = () => {
  if (scrollQueued) return;
  scrollQueued = true;
  requestAnimationFrame(() => {
    scrollQueued = false;
    const max = document.documentElement.scrollHeight - innerHeight;
    rail?.style.setProperty('--p', max > 0 ? (scrollY / max).toFixed(4) : 0);
    root.style.setProperty('--st', Math.min(0.5, (scrollY / innerHeight) * 0.6).toFixed(3));
    const ref = scrollY + innerHeight * 0.5;
    let current = -1;
    phaseTops.forEach((t, i) => { if (ref >= t) current = i; });
    if (current >= 0 && ref > phaseTops.at(-1) + phases.at(-1).offsetHeight) current = -1;
    $$('.rail a').forEach((a, i) => a.setAttribute('aria-current', String(i === current)));
    stills.update();
  });
};
addEventListener('scroll', onScroll, { passive: true });

let resizeTimer = null;
const onResize = () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { measurePhases(); stills.measure(); onScroll(); }, 150);
};
addEventListener('resize', onResize);
new ResizeObserver(onResize).observe(document.body);

// Copy buttons
for (const btn of $$('.copy')) {
  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(btn.dataset.copy);
      btn.textContent = 'Copied';
    } catch {
      btn.textContent = 'Select it';
    }
    setTimeout(() => { btn.textContent = 'Copy'; }, 1600);
  });
}

// Motion toggle — present near the top and remembered, as the checklist asks of
// scroll-driven sites. It never overrides the OS setting.
$('.motion').addEventListener('click', () => {
  if (prefersReducedMotion()) return;
  setWant(site.want === 'still' ? 'scene' : 'still');
});

for (const b of $$('.switch button')) {
  b.addEventListener('click', () => { if (!b.disabled && b.dataset.mode !== site.want) setWant(b.dataset.mode); });
}

matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', () => render());

// ---------------------------------------------------------------------------
// Go
// ---------------------------------------------------------------------------

// Startup runs as a few short tasks rather than one long one. Measuring forces a layout
// of the whole page, and the mount gate's WebGL probe creates a context — together they
// were a 60ms task on a throttled phone, landing just after first paint.
const yieldToMain = () => new Promise((resolve) => {
  if (globalThis.scheduler?.yield) globalThis.scheduler.yield().then(resolve);
  else setTimeout(resolve, 0);
});
(async () => {
  await yieldToMain();
  measurePhases();
  stills.measure();
  onScroll();
  await yieldToMain();
  setWant(site.want);
})();
