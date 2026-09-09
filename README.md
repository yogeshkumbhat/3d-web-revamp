# 3d-web-revamp

An [Agent Skill](https://docs.claude.com/en/docs/agents-and-tools/agent-skills/overview)
for Claude — rebuild an existing website as a 3D/WebGL experience, or build a new one
from a brief, without shipping the usual 6MB dead-crawler disaster.

It covers auditing and preserving the current site's content, choosing the right kind of
3D for the business (configurator, brand hero, narrative scroll, portfolio), art
direction, the glTF/Draco/KTX2 asset pipeline, hard performance budgets, device tiering,
and a non-negotiable fallback layer for crawlers, no-WebGL and reduced-motion users.

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
  anti-patterns.md        what goes wrong
  ship-checklist.md       pre-launch gate
  case-studies/           measured teardowns of public sites
assets/starter/           runnable Three.js + R3F starter
scripts/                  audit_site.py, capture_poster.js
```

## Case studies

The teardowns measure publicly accessible sites and analyse their structural and
performance decisions. No copy, fonts, models or film from those sites is included or
redistributed — study the decisions, not the materials.

## License

MIT — see [LICENSE](LICENSE).
