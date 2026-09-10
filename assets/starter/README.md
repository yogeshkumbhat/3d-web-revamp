# Starter

A working reference implementation of the patterns this skill requires. Not a template
to ship as-is — the geometry is a placeholder. The scaffolding around it is the point,
because that scaffolding is what people skip and what makes 3D sites fail in production.

Verified rendering in headless Chrome. Re-run the check yourself — it exits non-zero
on failure, so the claim cannot rot silently:

```bash
cd assets/starter && python3 -m http.server 8000 &
node ../../scripts/verify_starter.mjs
```

It asserts that a visible tab mounts the scene, that `prefers-reduced-motion` takes the
static path and never mounts, and that a page loaded in a *background* tab stays dark
while hidden and mounts once the visitor switches to it.

## Run it

```bash
cd assets/starter
python3 -m http.server 8000     # any static server works
open http://localhost:8000
```

No build step — `index.html` carries an import map pointing at a pinned Three.js on a
CDN. In a real project drop the import map and let your bundler resolve `three`, so you
get tree-shaking and a locked version.

Add `?tier=high|medium|low` to force a quality tier. That override exists so the scene
can be tested on hardware that would normally take the static path, including CI and
headless browsers. It never affects real users, and it deliberately does **not**
override reduced motion — that's a stated accessibility need, not a capability guess.

## The modules

| File | What it does |
|---|---|
| `quality.js` | Tier definitions, capability detection, and a live frame-time probe that steps the tier down when the initial guess was optimistic |
| `mount.js` | The single gate deciding whether the 3D layer loads at all — WebGL, reduced motion, tier, viewport proximity, tab visibility |
| `lifecycle.js` | Context-loss handling and deep resource disposal, plus a leak reporter |
| `materials.js` | Procedural studio environment, three-point rig, fresnel rim, film grain, contact shadow, damped pointer tracking |
| `poster.js` | Crossfade from poster to canvas, and back again on context loss |
| `scene-vanilla.js` | Complete hero scene wiring all of the above, vanilla Three.js |
| `Hero.jsx` | The same patterns for React Three Fiber |
| `index.html` | Static-first shell — full content, poster as LCP element, canvas as enhancement |

`quality.js`, `mount.js`, `lifecycle.js` and `materials.js` are framework-agnostic, so
the rules live in one place instead of being reimplemented per stack.

## Two details worth understanding

**Detection is deliberately humble.** `navigator.deviceMemory` is Chromium-only —
Safari and Firefox return `undefined`. Treating a missing value as "low" would
permanently lock a third of desktop users out of the high tier, so missing signals mean
*unknown*, not *bad*, and the frame probe is the real arbiter. What genuinely does force
the static path is a software renderer (SwiftShader, llvmpipe), which no memory or
core-count check would catch.

**The reveal waits for a drawn frame, not a loaded module.** `init()` resolves only
after `renderer.render()` has run at least once, so the canvas never appears empty.

## Adapting it

1. Replace the torus knot in `scene-vanilla.js` with your loaded `.glb`. Run it through
   `scripts/optimize_assets.sh` first.
2. Re-frame the camera. The current framing keeps the subject right-of-centre so the
   headline has a quiet region — keep that intent, change the numbers.
3. Re-tune the environment in `createStudioEnvironment()` to your art direction, or swap
   in a real HDRI if you need a specific studio look.
4. Regenerate the poster from the finished scene:
   ```bash
   node scripts/capture_poster.js http://localhost:8000 --out ./public
   ```
5. Measure before you ship:
   ```bash
   node scripts/check_budget.js http://localhost:8000 --mobile --duration 30
   ```

## What not to change

The mount gate, the poster-first ordering, and the disposal paths. Those are the parts
that keep the site working for the people who never see the scene — which, on a typical
site, is a larger share of visitors than the people who do.
