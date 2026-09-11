/**
 * The page's scene — a scroll-driven stack, built on assets/starter.
 *
 * Tiering, the frame-time probe, context-loss handling, disposal, the poster crossfade,
 * the procedural environment, the rim, grain, contact shadow and damped pointer all come
 * from the starter unchanged. This file only adds the subject and the choreography,
 * which is exactly the split the skill recommends.
 *
 * Contract (same as the starter's scene-vanilla.js): init() resolves once a frame has
 * actually been drawn, and returns { destroy, pause, resume } — plus stats() for the HUD.
 */

import * as THREE from 'three';
import { createTierProbe } from '../../assets/starter/quality.js';
import { handleContextLoss, disposeScene } from '../../assets/starter/lifecycle.js';
import { createPosterReveal } from '../../assets/starter/poster.js';
import {
  createStudioEnvironmentAsync,
  createLightRig,
  addFresnelRim,
  createGrainOverlay,
  createContactShadow,
  createPointerTracker,
} from '../../assets/starter/materials.js';
import { STATIONS, stationFor } from './stations.js';
import { createStack, createGround, makeTexture, LAYERS, BASE_Y } from './stack.js';

const NARROW_ASPECT = 0.95;

// Hand the main thread back between init steps. Each step is well under 50ms on a
// throttled phone; run back to back, they would add up to one long task and hurt INP.
const yieldToMain = () => new Promise((resolve) => {
  if (globalThis.scheduler?.yield) globalThis.scheduler.yield().then(resolve);
  else setTimeout(resolve, 0);
});
const mark = (name) => performance.mark?.(`scene:${name}`);

export async function init(container, tier, { pose = null } = {}) {
  mark('init');
  const canvas = container.querySelector('canvas');
  const reveal = createPosterReveal(container, { duration: 900 });

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: tier.antialias,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, tier.dpr));
  renderer.setSize(container.clientWidth, container.clientHeight, false);
  renderer.setClearColor(0x07080a, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x07080a, 0.045);

  const camera = new THREE.PerspectiveCamera(32, container.clientWidth / container.clientHeight, 0.1, 80);
  mark('renderer');
  await yieldToMain();

  scene.environment = await createStudioEnvironmentAsync(renderer, {
    top: '#2c323c',
    bottom: '#07080a',
    keyIntensity: 3.6,
    fillColor: '#7fd4ff',
    fillIntensity: 1.1,
  });

  mark('environment');
  await yieldToMain();

  // No shadow maps at any tier: a contact shadow grounds the stack for one draw call.
  const lights = createLightRig(scene, { ...tier, shadows: false }, {
    keyColor: '#f3f7ff', keyIntensity: 2.2, rimIntensity: 2.0,
  });
  const keyHome = lights.key.position.clone();

  // The plate drawings use the page's mono face. Wait for it briefly, so the live
  // scene and the build-time stills draw identical labels.
  await Promise.race([
    document.fonts?.load('500 21px "JetBrains Mono"') ?? Promise.resolve(),
    new Promise((r) => setTimeout(r, 1500)),
  ]).catch(() => {});

  // Draw and upload the plate drawings one per task, rather than all five inside a
  // single long one or, worse, inside the first frame.
  const maps = [];
  for (const name of LAYERS) {
    const map = makeTexture(name, tier);
    renderer.initTexture(map);
    maps.push(map);
    await yieldToMain();
  }
  mark('textures');

  const stack = createStack({ rim: addFresnelRim, maps });
  scene.add(stack.group);
  mark('stack');
  await yieldToMain();

  scene.add(createGround());

  const contact = createContactShadow({ size: 4.6, opacity: 0.62, softness: 0.5 });
  contact.scale.set(1, 0.72, 1);
  scene.add(contact);

  const grain = tier.name === 'low' ? null : createGrainOverlay({ intensity: 0.038 });
  if (grain) scene.add(grain);

  const pointer = createPointerTracker({ rangeX: 0.5, rangeY: 0.3, damping: 0.04 });

  // --- Scroll → station mapping -------------------------------------------
  // Measured on resize, never in the loop: the loop reads scrollY and nothing else.
  let marks = [];
  const measure = () => {
    const els = [...document.querySelectorAll('[data-station]')];
    marks = els.map((el) => {
      const r = el.getBoundingClientRect();
      return { name: el.dataset.station, y: r.top + window.scrollY + Math.min(r.height, window.innerHeight) * 0.5 };
    });
    if (!marks.length) marks = [{ name: 'hero', y: 0 }];
    buildPaths();
  };

  let camPath = null;
  let aimPath = null;
  const buildPaths = () => {
    const pts = marks.map((m) => new THREE.Vector3(...stationFor(m.name).cam));
    const aims = marks.map((m) => new THREE.Vector3(...stationFor(m.name).aim));
    if (pts.length === 1) { pts.push(pts[0].clone()); aims.push(aims[0].clone()); }
    camPath = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    aimPath = new THREE.CatmullRomCurve3(aims, false, 'centripetal');
  };

  const targetIndex = () => {
    if (pose) {
      const i = marks.findIndex((m) => m.name === pose);
      return Math.max(0, i);
    }
    const ref = window.scrollY + window.innerHeight * 0.5;
    if (ref <= marks[0].y) return 0;
    for (let k = 0; k < marks.length - 1; k++) {
      if (ref < marks[k + 1].y) {
        const f = (ref - marks[k].y) / (marks[k + 1].y - marks[k].y);
        // Smootherstep holds the camera at each station while its text is read, and
        // moves between them. The stillness is what makes the motion feel deliberate.
        const e = f * f * f * (f * (f * 6 - 15) + 10);
        return k + e;
      }
    }
    return marks.length - 1;
  };

  // --- Interpolated state, preallocated ---------------------------------------
  const state = {
    spread: 1, yaw: 0, key: 0, dims: 0, shift: 0,
    show: [0, 0, 0, 0, 0], glow: [0, 0, 0, 0, 0], lift: [0, 0, 0, 0, 0],
  };
  const mix = (a, b, t) => a + (b - a) * t;
  const blend = (fi) => {
    const k = Math.min(Math.floor(fi), marks.length - 1);
    const t = fi - k;
    const A = stationFor(marks[k].name);
    const B = stationFor(marks[Math.min(k + 1, marks.length - 1)].name);
    state.spread = mix(A.spread, B.spread, t);
    state.yaw = mix(A.yaw, B.yaw, t);
    state.key = mix(A.key, B.key, t);
    state.dims = mix(A.dims, B.dims, t);
    state.shift = mix(A.shift, B.shift, t);
    for (let i = 0; i < 5; i++) {
      state.show[i] = mix(A.show[i], B.show[i], t);
      state.glow[i] = mix(A.glow[i], B.glow[i], t);
      state.lift[i] = mix(A.lift[i], B.lift[i], t);
    }
  };

  const _cam = new THREE.Vector3();
  const _aim = new THREE.Vector3();
  const _dir = new THREE.Vector3();
  const _right = new THREE.Vector3();
  const _up = new THREE.Vector3(0, 1, 0);

  const place = (fi, p) => {
    const u = marks.length > 1 ? fi / (marks.length - 1) : 0;
    camPath.getPoint(u, _cam);
    aimPath.getPoint(u, _aim);

    const aspect = camera.aspect;
    // Narrow screens: centre the stack and back the camera off so it fits the width.
    const wide = THREE.MathUtils.clamp((aspect - 0.7) / (1.5 - 0.7), 0, 1);
    const back = aspect < NARROW_ASPECT ? 1 + (NARROW_ASPECT - aspect) * 1.25 : 1;

    _dir.subVectors(_cam, _aim).multiplyScalar(back);
    _cam.copy(_aim).add(_dir);

    // Pan camera and target together along the camera's right vector, so the stack
    // lands right of centre and the headline gets a quiet region — without changing
    // the angle the station was designed from.
    _right.crossVectors(_up, _dir).normalize();
    _cam.addScaledVector(_right, -state.shift * wide);
    _aim.addScaledVector(_right, -state.shift * wide);
    // Phones: type fills the lower half, so lift the stack into the top third.
    const lift = (1 - wide) * 1.45;
    _aim.y -= lift; _cam.y -= lift;

    // Damped pointer parallax, a few degrees at most.
    _cam.addScaledVector(_right, p.x * 1.1);
    _cam.y -= p.y * 0.6;

    camera.position.copy(_cam);
    camera.lookAt(_aim);
  };

  // --- Loop -------------------------------------------------------------------
  const clock = new THREE.Clock();
  let frameId = null;
  let running = true;
  let firstFrameDone = false;
  let currentTier = tier;
  let current = 0;
  let idleFrames = 0;
  let skip = false;
  const lastP = { x: 0, y: 0 };
  const still = { x: 0, y: 0 };
  const deltas = [];

  const probe = createTierProbe(tier, (next, p95) => {
    console.info(`[3d] frame p95 ${p95.toFixed(1)}ms — dropping to ${next.name}`);
    currentTier = next;
    if (next.name === 'floor') {
      stop();
      reveal.restore();
      window.dispatchEvent(new CustomEvent('scene:floor'));
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, next.dpr ?? 1));
    if (next.name === 'low' && grain) grain.visible = false;
  });

  const tick = () => {
    frameId = requestAnimationFrame(tick);
    const delta = Math.min(clock.getDelta(), 0.1);
    const elapsed = pose ? 0 : clock.elapsedTime;

    deltas.push(delta * 1000);
    if (deltas.length > 120) deltas.shift();
    probe.tick(delta * 1000);

    const target = targetIndex();
    const before = current;
    if (pose || !firstFrameDone) {
      current = target;
    } else {
      // Time-based damping, with the per-frame step clamped so a flick to the bottom of
      // the page glides instead of cutting.
      const step = (target - current) * (1 - Math.exp(-delta * 3.2));
      current += THREE.MathUtils.clamp(step, -0.09, 0.09);
    }

    const p = pose ? still : pointer.update(elapsed);

    // Nothing moving? Render every other frame. The stack's breathing is slow enough
    // that 30fps is indistinguishable, and it halves the battery cost of reading.
    const moving = Math.abs(current - before) > 1e-4
      || Math.abs(p.x - lastP.x) > 1e-5 || Math.abs(p.y - lastP.y) > 1e-5;
    lastP.x = p.x; lastP.y = p.y;
    idleFrames = moving ? 0 : idleFrames + 1;
    if (firstFrameDone && idleFrames > 90) {
      skip = !skip;
      if (skip) return;
    }

    blend(current);
    stack.apply(state, elapsed);
    contact.position.y = BASE_Y - 0.3;
    contact.material.opacity = 0.35 + (1 - state.spread) * 0.4;

    const ang = state.key * Math.PI;
    lights.key.position.set(
      keyHome.x * Math.cos(ang) - keyHome.z * Math.sin(ang),
      keyHome.y,
      keyHome.x * Math.sin(ang) + keyHome.z * Math.cos(ang),
    );

    place(current, p);

    if (grain) grain.material.uniforms.uTime.value = pose ? 0.5 : elapsed;

    renderer.render(scene, camera);

    if (!firstFrameDone) {
      firstFrameDone = true;
      reveal.reveal();
    }
  };

  const start = () => { if (!running) { running = true; clock.start(); tick(); } };
  const stop = () => {
    running = false;
    if (frameId) cancelAnimationFrame(frameId);
    frameId = null;
  };

  // --- Resize -----------------------------------------------------------------
  let resizeTimer = null;
  const resize = () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, currentTier.dpr ?? 1));
    measure();
  };
  const onResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 120);
  };
  window.addEventListener('resize', onResize);
  // Layout also moves when web fonts land or content reflows; re-measure then too.
  const ro = new ResizeObserver(onResize);
  ro.observe(document.body);

  // --- Context loss -------------------------------------------------------------
  const detachContext = handleContextLoss(canvas, {
    onLost: () => { stop(); reveal.restore(); },
    onRestored: () => {
      console.warn('[3d] context restored — reinitialising');
      window.dispatchEvent(new CustomEvent('scene:needs-reinit'));
    },
  });

  measure();
  current = targetIndex();
  blend(current);
  stack.apply(state, 0);
  place(current, { x: 0, y: 0 });

  // Pre-warm every program before the first visible frame. compileAsync lets the
  // driver compile in parallel (KHR_parallel_shader_compile) instead of freezing the
  // main thread the way a synchronous compile does.
  // Everything, including what the opening station hides — the dimension line only
  // appears at the budgets phase, and compiling it there would hitch the scroll.
  const hidden = [];
  scene.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
  await yieldToMain();
  await renderer.compileAsync(scene, camera);
  for (const o of hidden) o.visible = false;
  mark('compiled');
  await yieldToMain();

  tick();
  mark('first-frame');

  await new Promise((resolve) => {
    const check = () => (firstFrameDone ? resolve() : requestAnimationFrame(check));
    check();
  });

  return {
    pause: stop,
    resume: start,
    stats() {
      const sorted = [...deltas].sort((a, b) => a - b);
      const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
      const mean = deltas.reduce((a, b) => a + b, 0) / (deltas.length || 1);
      return {
        tier: currentTier.name,
        fps: mean ? Math.min(240, 1000 / mean) : 0,
        p95,
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        station: marks[Math.round(current)]?.name,
      };
    },
    destroy() {
      stop();
      probe.stop();
      window.removeEventListener('resize', onResize);
      ro.disconnect();
      clearTimeout(resizeTimer);
      detachContext();
      pointer.dispose();
      lights.dispose();
      stack.dispose();
      scene.environment?.dispose?.();
      disposeScene(scene, renderer);
    },
  };
}

export { STATIONS };
