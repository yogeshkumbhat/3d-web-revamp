---
name: 3d-web-revamp
description: Rebuild an existing website as a high-quality 3D/WebGL experience, or build a new one from a brief. Covers auditing and preserving the current site's content, choosing the right kind of 3D for the business (product configurator, brand hero, narrative scroll, portfolio), art direction, the glTF/Draco/KTX2 asset pipeline, hard performance budgets, device tiering, and the non-negotiable fallback layer for crawlers, no-WebGL and reduced-motion users. Use this skill whenever the user mentions a 3D website, WebGL, Three.js, React Three Fiber, Spline, a product configurator, an immersive or interactive site, "make my site look premium/award-winning", scroll-driven animation, or redesigning/revamping a site with depth or motion — even if they never say the words "3D" or "Three.js". Also use it when the user asks whether 3D is a good idea for their site.
---

# 3D Web Revamp

Build 3D websites that ship: fast, accessible, and grounded in what the business actually
sells. Most 3D sites fail the same way — a beautiful scene, a 6MB bundle, a dead crawler
view, and content that got lost in the rewrite. This skill exists to prevent that.

## The two entry modes

**Revamp** — the user has a live site (URL) or its files. Their content, brand and
conversion paths already exist and must survive the rebuild. Start at Phase 0.

**Greenfield** — the user has a brief, a brand, maybe some assets. Skip Phase 0's
extraction, but still do Phase 1 (route) before writing code.

## Phase 0 — Audit and inventory (revamp only)

Never start a 3D rebuild without a content inventory. The single most common failure in
site revamps is silently dropping pages, copy, schema markup or conversion paths because
the new design "didn't have a place for them."

Run `scripts/audit_site.py <url>` to pull the page inventory, copy, headings, meta tags,
colour palette, fonts, and existing analytics/conversion hooks into a structured report.
If the user gave you files instead, read them directly and produce the same inventory.

Then read `references/audit.md` and follow it. It covers what to preserve, what to
question, and how to decide whether 3D is even the right move for this site — sometimes
the honest answer is "your site is slow and the copy is weak, and 3D fixes neither."

Present the inventory and your read of it before building anything. If 3D is a bad fit,
say so plainly and explain what would actually move the needle.

## Phase 1 — Route to a category

3D does a different job in each of these. Pick one; do not blend them. Blending is why
generic "3D website" builds feel like a demo reel instead of a product.

| Category | The 3D's job | Read |
|---|---|---|
| **Commerce / product** | Let the buyer inspect and configure the actual thing they'll receive | `references/configurator.md` |
| **Brand / service** | One restrained moment that signals craft, then get out of the way | `references/hero-scene.md` |
| **Narrative / launch** | Carry a story as the user scrolls | `references/scroll-scene.md` |
| **Portfolio / studio** | The site *is* the work sample | `references/hero-scene.md` + `references/scroll-scene.md` |

Route by what the business needs, not by what looks impressive. A consultancy asking for
a full scroll-driven world usually needs a hero accent and better proof of work. Say so.

If the user is unsure, ask one question: *what does a visitor need to believe before they
convert?* The answer picks the category.

## Phase 2 — Art direction before code

Read `references/art-direction.md`. Decide, in writing, before any scene code.

Decide too what genuinely needs a GPU. WebGL earns its place for things DOM and CSS
cannot do; type, layout and photographic backdrops are usually better, cheaper and more
accessible as DOM and video. `references/case-studies/pear-no.md` is a measured example
of a site that reads as premium on nine draw calls.

If the answer is video or imagery rather than a scene, read `references/media-sources.md`
before sourcing anything. It covers which libraries are safe to use on a commercial client
site and which need the licence read per clip, the four clauses that decide it, and how to
turn the art direction into a search that returns the right footage instead of the
prettiest. Then `scripts/optimize_video.sh` produces the shippable ladder.

Then settle:

- the emotion and archetype (precision? warmth? weight? weightlessness?)
- material language (glass, brushed metal, clay, matte plastic, volumetric fog)
- lighting mood and key colour
- camera behaviour and whether the user controls it
- typography and how HTML type sits against the 3D layer

Generic 3D looks generic because it starts with `new THREE.Scene()` and decides how it
should feel afterwards. State the direction in a short paragraph, get a nod, then build.

## Phase 3 — Architecture and build

Read `references/architecture.md` for the stack decision (R3F vs vanilla Three vs Spline),
the project skeleton, quality tiers, and how the 3D layer mounts without hurting LCP.

**Start from `assets/starter/`, not from an empty file.** It is a verified working
implementation of the parts that are easy to get wrong and invisible when you do:
the mount gate, tier detection with a live frame-time probe, context-loss recovery,
poster crossfade, and full resource disposal. `scene-vanilla.js` and `Hero.jsx` are the
same patterns for vanilla Three and React Three Fiber; the modules underneath are
framework-agnostic. Read `assets/starter/README.md` first, then replace the placeholder
geometry and re-frame the camera. Rewriting this scaffolding from scratch reliably
reproduces the bugs it already solves.

Read `references/asset-pipeline.md` before touching any model. Use
`scripts/optimize_assets.sh` for the glTF → Draco/meshopt → KTX2 pipeline. If there are no
models and no budget for an artist, that reference covers procedural and CSS-3D routes
that still look intentional.

Build order that reliably works:

1. Static HTML/CSS site with all content, fully functional with zero JavaScript
2. Fallback poster image in the 3D container
3. Scene mounted lazily, replacing the poster once ready
4. Interaction and motion
5. Post-processing and polish, last, budget permitting

This order guarantees that a failed WebGL context, a crawler, or a slow device gets a
complete site instead of a blank div. If you build the scene first and retrofit the
fallback, the fallback will be an afterthought and it will show.

## Phase 4 — Budgets, enforced

Read `references/performance.md` for the full set and how to measure. The headline
numbers, treated as pass/fail rather than aspirations:

- **LCP under 2.5s** on a mid-tier Android over 4G. The 3D layer must never be the LCP element.
- **3D payload, gzipped, above the fold:** ≤1.5MB brand hero, ≤2.5MB configurator (incl. shared libs), ≤4MB narrative
- **60fps desktop, 30fps floor mobile.** Drop quality tiers rather than dropping frames.
- **Draw calls:** ≤100 desktop, ≤50 mobile
- **No task over 50ms** on the main thread after first paint
- **Thermal:** scene must survive 3 minutes on a mid-tier phone without throttling to a slideshow

If a budget can't be met, cut the effect — not the budget. Bloom and godrays are the first
things to go, and almost nobody notices.

## Phase 5 — The fallback layer, non-negotiable

Read `references/accessibility-seo.md`. Every build ships with:

- Full content in the DOM as real HTML — crawlers and screen readers never depend on the canvas
- `prefers-reduced-motion` honoured with a genuinely static alternative, not a slower animation
- A poster image or CSS-only treatment when WebGL is unavailable or the context is lost
- Keyboard access to every interaction the 3D layer offers (a configurator's colour swaps must work as buttons)
- The canvas marked `aria-hidden` when it's decorative, described properly when it isn't

A 3D site that only works for a sighted user on a fast laptop with a mouse is a demo, not
a website.

## Phase 6 — Ship gate

Read `references/ship-checklist.md` and run it honestly before calling anything done.

Measure rather than assume — `scripts/check_budget.js` does it:

```bash
node scripts/check_budget.js http://localhost:5173 --mobile --duration 30
```

It reports LCP and which element is the LCP, CLS, transfer size, frame-time p95, draw
calls and triangles per frame (counted by instrumenting the GL context, so it works
regardless of framework), sustained drift for thermal throttling and leaks, and the
no-JS, reduced-motion and no-WebGL fallback paths. It exits non-zero on failure, so it
can gate a deploy.

Where it cannot measure something reliably it says "not measurable" rather than
inventing a verdict — headless browsers throttle rendering, so frame timing from CI
catches regressions but is not a substitute for a real device.

Report results as a pass/fail list with the measured numbers. If something fails, fix it
or tell the user what you traded away and why. Never report a checklist as passed on the
strength of assumption; a checklist filled in from guesses transfers confidence without
transferring evidence.

## Before you write scene code

Read `references/anti-patterns.md`. It is the shortest file here and the highest-value
one — a catalogue of the failures that recur in nearly every 3D build, most of which are
free to avoid up front and expensive to fix after launch. Scan it once per project.

## Working style

Show the fallback and the budget numbers alongside the pretty screenshot. Users judge 3D
work on the demo and get burned by the production reality — inverting that is the whole
value of this skill.

Push back when the request and the goal don't match. "This would look incredible and cost
you conversions" is more useful than a compliant build.

## Reference files

- `references/audit.md` — extracting and preserving an existing site; is 3D right here
- `references/art-direction.md` — deciding the look before writing scene code
- `references/architecture.md` — stack choice, skeleton, quality tiers, mounting
- `references/configurator.md` — commerce path: variants, AR, buying signals
- `references/hero-scene.md` — brand/service path: restraint and one strong moment
- `references/scroll-scene.md` — narrative path: scroll binding without mobile pain
- `references/asset-pipeline.md` — glTF, Draco, meshopt, KTX2, procedural alternatives
- `references/performance.md` — full budgets, device tiering, measurement
- `references/accessibility-seo.md` — fallbacks, reduced motion, crawlers, keyboard
- `references/ship-checklist.md` — the gate before you call it done
- `references/media-sources.md` — licence-safe media sourcing, search vocabulary, self-hosting
- `references/anti-patterns.md` — the recurring failure modes, scan this early
- `references/case-studies/` — measured teardowns of real sites: what the technique
  actually was, and what it cost. Read the relevant one when a client points at a
  reference site and asks for "that feeling" — the answer is usually that most of the
  feeling is cheap and one part of it is not.

## Assets

- `assets/starter/` — verified working reference implementation; start here rather than
  from an empty file. See its README for what each module does and what not to change.

## Scripts

- `scripts/fetch_fixture.py` — downloads a CC0 test model so the pipeline can be run
  end to end when the user has not supplied one yet
- `scripts/audit_site.py <url>` — content, meta, palette and font inventory of a live site
- `scripts/optimize_assets.sh <input.glb>` — compression pipeline with budget reporting
- `scripts/check_budget.js <url>` — measures performance and fallback paths, exits non-zero on failure
- `scripts/capture_poster.js <url>` — renders the poster from the live scene in AVIF/WebP/JPEG
- `scripts/optimize_video.sh <clip>` — video hero encode ladder: h264 + vp9 + poster +
  reduced-motion still, budget-checked, exits non-zero on failure
- `scripts/verify_starter.mjs` — drives the starter headlessly through visible,
  reduced-motion and background-tab states; exits non-zero on failure

The Node scripts need `npm i puppeteer` (and `sharp` for poster encoding). The Python
scripts need `pip install requests beautifulsoup4`. `optimize_assets.sh` uses
`@gltf-transform/cli`, falling back to `npx` when it is not installed globally.

## A worked example

> "Revamp barrelandoak.com — we make solid oak furniture, we want it to feel premium."

1. `audit_site.py` → 34 pages, 11 product pages, JSON-LD `Product` markup on each,
   a Klaviyo embed, GA4. Baseline LCP 3.9s mobile.
2. Verdict: 3D fits. Physical product, unanswered spatial questions (how big, what
   finish, how does the grain read). Category: **commerce**, not brand hero — the
   configurator earns revenue, a hero scene would only cost load time.
3. Art direction: warmth and craft. Oak and blackened steel, one large soft warm key,
   near-neutral ground, camera constrained to a damped orbit with a scale reference.
4. Build from `assets/starter/`, swap the placeholder for the first SKU, share one
   material library and one light rig across all 11 products.
5. `optimize_assets.sh` per SKU at `--category configurator`; variants swap material
   properties on one model rather than downloading eleven.
6. `capture_poster.js` per product — those posters are also the no-WebGL experience and
   the images that surface in image search.
7. `check_budget.js --mobile` until it exits zero, then confirm on a real Pixel.
8. Ship report against the 3.9s baseline, with the JSON-LD and Klaviyo embed verified
   present.
