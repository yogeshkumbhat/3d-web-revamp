# Site

The skill's homepage, built with the skill: **https://yogeshkumbhat.github.io/3d-web-revamp/**

A narrative (scroll-driven) site. An exploded stack of five plates — content, poster,
scene, interaction, polish — is choreographed through the seven phases, and every state
of the page is checked on each deploy.

## Build and check

```bash
npm i --no-save three@0.169.0 esbuild@0.24.0 puppeteer sharp   # once, at the repo root
node site/build.mjs --posters     # bundle + render the stills from the built scene
node site/verify.mjs              # every visitor path; exits non-zero on failure
node site/serve.mjs               # http://127.0.0.1:8080 — look at it
```

`node site/build.mjs` without `--posters` is a fast code-only rebuild that keeps the
stills from the last full build. Add `?tier=high|medium|low` to force a quality tier.

Budgets, measured with the skill's own checker:

```bash
node scripts/check_budget.js "http://127.0.0.1:8080/?tier=high" --mobile --category narrative --gpu
```

`--gpu` matters on a dev machine: without it headless Chrome renders WebGL in software,
and GPU work shows up as main-thread long tasks that no real phone would have.

## How it is put together

| File | What it does |
|---|---|
| `index.html` | Every word of the page as static HTML, inline critical CSS, the hero poster as the base layer |
| `src/main.js` | Render path (scene or static), the stills per section, the HUD and measured numbers, the fallback switcher, motion toggle |
| `src/scene.js` | The scene: starter modules plus the stack and the scroll choreography; init yields between steps to stay under 50 ms per task |
| `src/stack.js` | Plates, their etched drawings (drawn on a 2D canvas at load — nothing downloaded), leader and dimension lines, the ground grid |
| `src/stations.js` | The choreography as data: one entry per `data-station` in the page. No Three.js import, so the static path can read it |
| `build.mjs` | esbuild bundle (Three.js only in a lazily loaded chunk), copies fonts and `assets/starter` to `/starter/`, renders the stills |
| `verify.mjs` | The deploy gate — see the header comment for every assertion |
| `serve.mjs` | Static server that gzips like GitHub Pages, so local transfer sizes are real |

The mount gate, tiering, frame-time probe, context-loss handling, poster crossfade,
procedural environment, rim, grain, contact shadow and damped pointer are all imported
from `assets/starter/` unchanged. Improvements made while building this page went back
into the starter and scripts rather than being patched locally.

## Changing the choreography

Edit `src/stations.js`, rebuild with `--posters` (the stills must match the scene), and
run `verify.mjs`. A station only needs the fields it changes; the rest inherit from the
hero. Add a new `poster` name to `POSTERS` if a station needs its own still.

Type is Instrument Serif, Instrument Sans and JetBrains Mono under the SIL Open Font
License — licences are in `fonts/`.
