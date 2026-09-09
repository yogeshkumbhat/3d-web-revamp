/**
 * Reference hero scene — vanilla Three.js.
 *
 * A complete, working implementation of the patterns this skill requires: tier-aware
 * quality, lazy mount, poster crossfade, context-loss recovery, frame-time probing,
 * pause-when-hidden, and full disposal. The geometry is deliberately plain — replace
 * it with the actual product or artefact. The scaffolding is the point.
 *
 * Exports an init() matching the contract mount.js expects: resolves once the first
 * frame has rendered, and returns { destroy, pause, resume }.
 */

import * as THREE from 'three';
import { createTierProbe } from './quality.js';
import { handleContextLoss, disposeScene } from './lifecycle.js';
import { createPosterReveal } from './poster.js';
import {
  createStudioEnvironment,
  createLightRig,
  addFresnelRim,
  createGrainOverlay,
  createContactShadow,
  createPointerTracker,
} from './materials.js';

export async function init(container, tier) {
  const canvas = container.querySelector('canvas');
  const reveal = createPosterReveal(container);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: tier.antialias,
    alpha: true,
    powerPreference: 'high-performance',
  });

  // Uncapped devicePixelRatio on a 3x phone renders 9x the pixels. This one line is
  // the most common difference between 60fps and 8fps on mobile.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, tier.dpr));
  renderer.setSize(container.clientWidth, container.clientHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = tier.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x08090b, 0.055);

  const camera = new THREE.PerspectiveCamera(
    35, container.clientWidth / container.clientHeight, 0.1, 100
  );
  // Framed so the subject sits right-of-centre, leaving a quiet region on the left
  // for the headline. Composition is decided here, not patched with CSS later.
  camera.position.set(-1.15, 1.15, 5.0);
  camera.lookAt(0.62, 1.0, 0);

  // Environment first — without one, every material reads as grey plastic.
  scene.environment = createStudioEnvironment(renderer, {
    top: '#3a3f4a',
    bottom: '#0a0b0e',
    keyIntensity: 4.4,
    fillIntensity: 1.3,
  });

  const lights = createLightRig(scene, tier);

  // --- Subject -------------------------------------------------------------
  // Replace with a loaded .glb. See references/asset-pipeline.md for the
  // compression chain that gets a designer export down to shippable size.
  const material = new THREE.MeshStandardMaterial({
    color: 0x2b2d33,
    roughness: 0.28,
    metalness: 0.9,
    envMapIntensity: 2.1,   // dark subjects need a strong environment to read at all
  });
  addFresnelRim(material, { color: '#7fd4ff', power: 2.8, intensity: 0.6 });

  const subject = new THREE.Mesh(new THREE.TorusKnotGeometry(0.72, 0.24, 180, 32), material);
  subject.position.set(0.95, 1.12, 0);
  subject.castShadow = tier.shadows;
  scene.add(subject);

  // Grounding. A real shadow when we can afford one, a gradient plane when we can't —
  // either way the object must not appear to float.
  if (tier.shadows) {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 30),
      new THREE.ShadowMaterial({ opacity: 0.42 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
  } else {
    const contact = createContactShadow({ size: 3.4, opacity: 0.5 });
    contact.position.x = subject.position.x;
    scene.add(contact);
  }

  const grain = createGrainOverlay({ intensity: 0.04 });
  scene.add(grain);

  const pointer = createPointerTracker();

  // Pre-warm shaders. First appearance of a material otherwise compiles it mid-frame
  // and freezes the main thread for 100ms+.
  renderer.compile(scene, camera);

  // --- Loop ----------------------------------------------------------------
  const clock = new THREE.Clock();
  let frameId = null;
  let running = true;
  let firstFrameDone = false;
  let currentTier = tier;

  const probe = createTierProbe(tier, (nextTier, p95) => {
    console.info(`[3d] frame p95 ${p95.toFixed(1)}ms — dropping to ${nextTier.name}`);
    currentTier = nextTier;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, nextTier.dpr ?? 1));
    renderer.shadowMap.enabled = !!nextTier.shadows;
    subject.castShadow = !!nextTier.shadows;
    if (nextTier.name === 'floor') { stop(); reveal.restore(); }
  });

  const tick = () => {
    frameId = requestAnimationFrame(tick);
    const delta = clock.getDelta();
    const elapsed = clock.elapsedTime;

    probe.tick(delta * 1000);

    const p = pointer.update(elapsed);
    // Damped, small-range. The subject responds; it doesn't perform.
    subject.rotation.y += delta * 0.16;
    subject.rotation.x = p.y * 1.4;
    camera.position.x = -1.15 + p.x * 1.5;
    camera.position.y = 1.15 - p.y * 0.45;
    camera.lookAt(0.62, 1.0, 0);

    grain.material.uniforms.uTime.value = elapsed;

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

  // --- Resize --------------------------------------------------------------
  const NARROW = 720;
  const applyComposition = () => {
    const narrow = container.clientWidth < NARROW;
    subject.position.x = narrow ? 0 : 0.95;
    camera.position.x = narrow ? 0 : -1.15;
    camera.lookAt(narrow ? 0 : 0.62, narrow ? 1.25 : 1.0, 0);
  };
  applyComposition();

  let resizeTimer = null;
  const onResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, currentTier.dpr ?? 1));
      applyComposition();
    }, 120);
  };
  window.addEventListener('resize', onResize);

  // --- Context loss --------------------------------------------------------
  const detachContext = handleContextLoss(canvas, {
    onLost: () => { stop(); reveal.restore(); },
    onRestored: () => {
      // All GPU resources are gone. In production, re-run init() rather than
      // attempting to reuse anything from the lost context.
      console.warn('[3d] context restored — reinitialising');
      window.dispatchEvent(new CustomEvent('scene:needs-reinit'));
    },
  });

  tick();

  // Resolve only once something has actually been drawn, so the caller can trust
  // that revealing the canvas won't show an empty frame.
  await new Promise((resolve) => {
    const check = () => (firstFrameDone ? resolve() : requestAnimationFrame(check));
    check();
  });

  return {
    pause: stop,
    resume: start,
    destroy() {
      stop();
      probe.stop();
      window.removeEventListener('resize', onResize);
      clearTimeout(resizeTimer);
      detachContext();
      pointer.dispose();
      lights.dispose();
      scene.environment?.dispose?.();
      disposeScene(scene, renderer);
    },
  };
}
