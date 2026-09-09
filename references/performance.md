# Performance

Budgets are pass/fail. If an effect breaks the budget, the effect goes — not the budget.
This is the part of a 3D build that requires discipline rather than skill, which is why it's
the part that usually gets skipped.

## The budget

Measured on a mid-tier Android (think Pixel 6a / Galaxy A54 class) over throttled 4G, and on
a 2020-era laptop.

| Metric | Target | Fails at |
|---|---|---|
| LCP (mobile) | < 2.5s | > 4s |
| INP | < 200ms | > 500ms |
| CLS | < 0.1 | > 0.25 |
| Time to first scene frame | < 3.5s | > 6s |
| Frame rate, desktop | 60fps | sustained < 50 |
| Frame rate, mobile | 60fps target, 30 floor | sustained < 28 |
| Frame time budget | < 16.6ms | > 22ms rolling avg |
| 3D payload gzipped | per category, see `asset-pipeline.md` | — |
| Draw calls | ≤100 desktop / ≤50 mobile | > 200 |
| Long tasks after first paint | none > 50ms | any > 200ms |
| Sustained mobile run | 3 min without visible throttling | drops > 30% |

The 3D layer is never the LCP element. If it is, the architecture is wrong — go back to the
mounting pattern in `architecture.md`.

## Measuring properly

**Frame time, not FPS.** FPS is an average and hides the stutter people actually feel. Log
the 95th percentile frame time.

```js
let frames = [];
function tick(t) {
  frames.push(t - last); last = t;
  if (frames.length > 300) frames.shift();
  requestAnimationFrame(tick);
}
const p95 = () => [...frames].sort((a,b)=>a-b)[Math.floor(frames.length * 0.95)];
```

**Renderer info** tells you where the cost is:

```js
console.log(renderer.info.render.calls,      // draw calls
            renderer.info.render.triangles,
            renderer.info.memory.geometries,
            renderer.info.memory.textures,
            renderer.info.programs.length);   // shader compilations
```

`renderer.info.memory` counts climbing over time means you're leaking — something isn't
being disposed.

**Real devices, not simulators.** Chrome DevTools 6x CPU throttle is a rough proxy; it does
not reproduce mobile GPU limits or thermal behaviour. Remote-debug an actual mid-range
Android. This is the single highest-value habit in web 3D.

**Test for three minutes.** Thermal throttling appears at 60–120 seconds. A scene that runs
at 60fps for fifteen seconds and 22fps thereafter has failed, and a short test will tell you
it passed.

## Optimisation order

Work in this order; each step is roughly 10x the payoff of the next.

1. **Cap DPR.** `Math.min(devicePixelRatio, 1.5)`. On a 3x phone this alone is often 3–4x
   the frame rate. Nothing else comes close.
2. **Cut real-time shadows.** One shadow-casting light at 1024 max, or bake to a contact
   shadow texture. Multiple shadow-casting lights on mobile is not viable.
3. **Drop post-processing on mobile.** Each pass is another full-screen render. Bloom and DoF
   are the usual culprits.
4. **Reduce draw calls.** Merge static geometry, use `InstancedMesh` for repeats, share
   materials aggressively. 200 objects with the same material should be one instanced mesh.
5. **Compress and resize textures.** See `asset-pipeline.md`. VRAM pressure causes stutter
   that profiles as "mysterious."
6. **Simplify geometry.** Usually the smallest win, and the one people try first.

## Common causes of bad performance

| Symptom | Likely cause |
|---|---|
| Terrible on phone, fine on laptop | Uncapped DPR, or fill-rate-bound post-processing |
| Stutter every few seconds | GC from per-frame allocation, or shader compilation on first appearance |
| Slow after navigating around a SPA | Undisposed geometries/materials/textures |
| Fine at first, degrades over minutes | Thermal throttling, or a growing leak |
| Long freeze on load | Synchronous shader compilation — pre-warm with `renderer.compile()` |
| Janky on scroll | Rendering on scroll events instead of rAF, or layout thrash from reading DOM in the loop |

## Per-frame allocation

The render loop runs 60 times a second. Allocating in it produces GC pauses.

```js
// bad — two allocations per frame
mesh.position.set(...computePosition());

// good — reuse
const _v = new THREE.Vector3();
function tick() {
  computePositionInto(_v);
  mesh.position.copy(_v);
}
```

Same for `new THREE.Color()`, `new THREE.Quaternion()`, array literals and closures inside
the loop.

## Shader compilation

First appearance of a material compiles its shader, which can freeze the main thread for
100ms+. Pre-warm after load, before the scene is revealed:

```js
renderer.compile(scene, camera);
```

For materials that appear later (a variant swap, a section reveal), compile them during the
loader rather than at the moment of use.

## Skip work that doesn't matter

- Stop the loop on `document.hidden`
- Skip rendering when nothing changed — no camera movement, no animation, no interaction
- Frustum culling is on by default; don't disable it without a reason
- LOD for anything the camera moves away from
- For a static hero: render once, then only on interaction. A hero scene does not need a
  60fps loop to sit still.

## Budget reporting

Report to the user as measured numbers, never estimates:

```
Measured — Pixel 6a, throttled 4G
LCP                 2.1s      PASS  (budget 2.5s)
First scene frame   3.2s      PASS  (budget 3.5s)
Frame time p95      18.4ms    PASS  (budget 22ms)
3-min sustained     54fps     PASS  (no throttling observed)
Payload gzipped     1.31MB    PASS  (budget 1.5MB)
Draw calls          38        PASS  (budget 50)
```

If something fails and you chose to ship anyway, say what was traded and why.
