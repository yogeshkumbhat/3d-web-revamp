# Architecture

## Stack decision

| Situation | Use | Why |
|---|---|---|
| Site is already React/Next | React Three Fiber + drei | Scene state lives in the same tree as UI state; drei covers 80% of the boilerplate |
| Static marketing site, one scene | Vanilla Three.js | No framework tax; ~170KB gzip for three alone vs ~250KB with R3F + drei |
| Non-developer will maintain the scene | Spline | GUI authoring, but the runtime is heavy and you lose fine control over the render loop |
| Heavy GPU work — particles, simulation | Three.js WebGPU renderer + TSL, WebGL2 fallback | Compute shaders; but keep the WebGL2 path working, WebGPU coverage is still uneven on mobile |

Default for a revamp of a modern site: **R3F**. Default for a one-scene brand hero on a
static site: **vanilla Three**, because the whole scene is 150 lines and the bundle saving
is real.

Do not ship both a heavy 3D runtime and a heavy animation library unless both earn it.
GSAP + Lenis + Theatre.js + drei + postprocessing is ~400KB before your scene exists.

## Project skeleton

```
src/
  content/            # copy, nav, meta — the site works from this alone
  components/
    ui/               # DOM layer: nav, sections, CTAs, forms
    scene/
      Canvas.tsx      # lazy-mounted wrapper, tier detection, context-loss handling
      Scene.tsx       # the actual scene graph
      Model.tsx       # loaders, suspense boundaries
      lighting.ts     # light rig as data, not scattered JSX
      quality.ts      # tier definitions
  fallback/
    poster.webp       # what non-WebGL users see
public/
  models/             # .glb, already compressed
  env/                # .hdr or .ktx2 environment
```

Keep the light rig and quality tiers as data. Scattering `<pointLight>` through the scene
graph makes art direction changes a scavenger hunt.

## Mounting without hurting LCP

The 3D layer must never be the LCP element. Pattern:

1. Server-render the full DOM including a `<picture>` poster in the canvas container
2. The poster is the LCP element — optimise it like any hero image (AVIF/WebP, correct
   `sizes`, `fetchpriority="high"`)
3. Dynamically import the scene bundle *after* first paint, gated on:
   - `IntersectionObserver` — the container is near the viewport
   - WebGL2 availability
   - `prefers-reduced-motion: no-preference`
   - device tier above the floor
4. Cross-fade the canvas over the poster once the first frame is rendered — not once the
   scene module loads. `gl.render()` once, then reveal.

```js
const supportsWebGL = () => {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
};

const shouldMount3D =
  supportsWebGL() &&
  !window.matchMedia('(prefers-reduced-motion: reduce)').matches &&
  deviceTier() !== 'floor';
```

Never mount the scene during hydration. It blocks the main thread at exactly the moment
INP is being measured.

## Quality tiers

Three tiers, decided once at load and re-checkable if frame time degrades.

```js
// quality.ts
export const TIERS = {
  high:   { dpr: [1, 2],   shadows: true,  shadowMap: 2048, env: 'hdr-2k',
            postprocessing: true,  particles: 40000, antialias: true },
  medium: { dpr: [1, 1.5], shadows: true,  shadowMap: 1024, env: 'hdr-1k',
            postprocessing: false, particles: 12000, antialias: true },
  low:    { dpr: [1, 1],   shadows: false, shadowMap: 0,    env: 'gradient',
            postprocessing: false, particles: 3000,  antialias: false },
};
```

Detect with a combination of signals — no single one is reliable:

```js
function deviceTier() {
  const mem = navigator.deviceMemory ?? 4;
  const cores = navigator.hardwareConcurrency ?? 4;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const saveData = navigator.connection?.saveData;

  if (saveData) return 'floor';
  if (mem <= 2 || cores <= 2) return 'floor';
  if (coarse && mem <= 4) return 'low';
  if (coarse) return 'medium';
  return mem >= 8 && cores >= 8 ? 'high' : 'medium';
}
```

Then **verify with a live probe**, because static detection is frequently wrong. Sample
frame time over the first 90 frames; if the rolling average exceeds 22ms, step down a tier
and re-probe. Step down at most twice, and never step back up — oscillating quality is
more noticeable than low quality.

Also listen for `visibilitychange` and stop the render loop when the tab is hidden. A
scene rendering in a background tab is how you get "this site kills my battery" reviews.

## Context loss

WebGL contexts get dropped, especially on mobile after a backgrounded tab. Handle it or
users get a black rectangle:

```js
canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();          // required, or the context never restores
  showPoster();
});
canvas.addEventListener('webglcontextrestored', () => {
  rebuildScene();              // resources are gone; re-init, don't reuse
  hidePoster();
});
```

## Disposal

R3F cleans up on unmount, but not what you created imperatively. Geometries, materials,
textures and render targets need explicit `.dispose()`. Leaks show up as a scene that gets
slower every time the user navigates back to the page in a SPA.

## Rendering settings that matter

```js
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;  // or AgXToneMapping for less punch
renderer.toneMappingExposure = 1.0;
renderer.setPixelRatio(Math.min(devicePixelRatio, tier.dpr[1]));
```

Uncapped `devicePixelRatio` on a 3x phone means rendering 9x the pixels. It is the single
most common cause of "why is this 8fps on my iPhone."
