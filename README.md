# 3d-web-revamp

An [Agent Skill](https://docs.claude.com/en/docs/agents-and-tools/agent-skills/overview)
for Claude — rebuild an existing website as a 3D/WebGL experience, or build a new one
from a brief, without shipping the usual 6MB dead-crawler disaster.

It covers auditing and preserving the current site's content, choosing the right kind of
3D for the business (configurator, brand hero, narrative scroll, portfolio), art
direction, the glTF/Draco/KTX2 asset pipeline, hard performance budgets, device tiering,
and a non-negotiable fallback layer for crawlers, no-WebGL and reduced-motion users.

## Live

**https://yogeshkumbhat.github.io/3d-web-revamp/** — the skill's homepage, built with the
skill. A scroll-driven 3D narrative through the seven phases that weighs about 270 KB on
first visit, measures itself live in the corner, and lets you switch it to the poster,
still and raw-HTML paths to see that nothing breaks. Source in [`site/`](site/).

**https://yogeshkumbhat.github.io/3d-web-revamp/starter/** — the bare starter from
`assets/starter/`. Add `?tier=high|medium|low` to either to force a quality tier.

Every push is gated: `scripts/verify_starter.mjs` checks the starter, then the site is
built (its posters rendered from the scene by `capture_poster.js`) and `site/verify.mjs`
drives it through the scene, reduced-motion, no-WebGL, no-JS, background-tab, switcher
and phone paths and holds the first visit to the 1.5 MB budget. A regression fails the
build instead of shipping.

## Install

Claude Code / Cowork:

```bash
git clone https://github.com/yogeshkumbhat/3d-web-revamp.git ~/.claude/skills/3d-web-revamp
```

Or drop the folder into a project's `.claude/skills/`. Claude loads it automatically when
a request mentions 3D sites, WebGL, Three.js, React Three Fiber, Spline, product
configurators, scroll-driven animation, or "make my site look premium".

## Layout

```
SKILL.md                  entry point — phases, routing, budgets
references/               deep dives loaded on demand
  audit.md                extracting content from a live site
  art-direction.md        look development
  architecture.md         app structure
  asset-pipeline.md       glTF → Draco → KTX2
  hero-scene.md           brand hero scenes
  scroll-scene.md         narrative scroll
  configurator.md         product configurators
  performance.md          budgets and device tiering
  accessibility-seo.md    the fallback layer
  media-sources.md        licence-safe stock, search vocabulary
  anti-patterns.md        what goes wrong
  ship-checklist.md       pre-launch gate
  case-studies/           measured teardowns of public sites
assets/starter/           runnable Three.js + R3F starter
scripts/                  audit_site.py, optimize_video.sh, check_budget.js, …
site/                     the homepage, built with the skill (not needed to use it)
```

## Try the pipeline

The repo ships no binary assets — a skill about payload discipline shouldn't put
megabytes into every clone. Instead it fetches one CC0 model on demand:

```bash
./scripts/fetch_fixture.py                       # WoodenChair_01 @ 1k, ~1 MB, CC0
./scripts/optimize_assets.sh fixtures/WoodenChair_01/WoodenChair_01_1k.gltf \
    --category configurator --texture-size 1024
```

Measured output, not an aspiration:

```
 Optimising: fixtures/WoodenChair_01/WoodenChair_01_1k.gltf
 Category:   configurator (budget 2.5 MB gzipped)
 Geometry:   meshopt
 Textures:   KTX2, max 1024px

  Before          1.03 MB
  After           721.31 KB  (-32%)
  Gzipped         682.23 KB
  Budget          2.5 MB
  Status          PASS
```

The fixture is from [Poly Haven](https://polyhaven.com/license) and is CC0 / public
domain — free to redistribute, modify and use commercially, no attribution required.
It is downloaded, never committed, so this repository stays MIT-clean.

## Case studies

The teardowns measure publicly accessible sites and analyse their structural and
performance decisions. No copy, fonts, models or film from those sites is included or
redistributed — study the decisions, not the materials.

## License

MIT — see [LICENSE](LICENSE).
