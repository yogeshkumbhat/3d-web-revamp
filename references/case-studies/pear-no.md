# Case study — pear.no

A Norwegian studio site, single page, heavily art-directed. Measured 9 September 2026.

Filed because it contradicts an assumption this skill could easily encourage: that a
premium, immersive site means WebGL doing the heavy lifting. This one is mostly video
and DOM, with WebGL used for one cheap decorative job — and it reads as more expensive
than most full Three.js builds.

**Scope note:** this is a structural and performance teardown. The copy, the licensed
typefaces (Flecha and GT Standard are commercial licences) and the film assets are
theirs — study the decisions, don't lift the materials.

## Measured

| | |
|---|---|
| Pages | 1 |
| Scroll height | 48,150px at 900px viewport — roughly 53 screens |
| Total transfer | 24.8 MB |
| Requests | 16 |
| Video | 24.4 MB across two MP4s (13.4 MB and 11.0 MB) |
| Fonts | 249 KB, six woff2 files |
| Images | 758 KB, one `<img>` in the DOM |
| Scripts | one bundle, one stylesheet, Vite-built |
| Canvases | two — a hidden 2D canvas, and a full-viewport WebGL canvas |
| WebGL draw calls | 9 total across a 9-second sample |
| `<section>` elements | 1 |
| Analytics | none detected |
| Structured data | present |

## The interesting finding

**Nine draw calls.** The WebGL canvas is class `lines` and renders a decorative
line/grid overlay — not the subject, not the atmosphere, not the type. A second canvas
is 2D and permanently `opacity: 0`, which is the signature of an offscreen text
measurement or texture atlas surface, not a visual layer.

So the visual weight is carried by: a large blurred background film, a serif display
face at enormous size, a monospace microtype label, and a grid of hairlines. WebGL does
the one thing DOM and CSS genuinely cannot — arbitrary vector lines that respond to
scroll and pointer without layout cost.

That is a better instinct than reaching for a 3D scene by default. The lesson worth
carrying into a build: **decide what actually needs a GPU, and give everything else to
DOM, CSS and video.** Type is sharper, selectable and accessible in the DOM; a
photographic backdrop is cheaper and more convincing as film than as a rendered scene.

## Composition technique worth stealing

The hero puts a huge serif line over a background film, and the film is heavily
defocused. That solves the quiet-region problem from `art-direction.md` a different way
— rather than framing the subject away from the type, they blur the background into a
low-frequency field so type can sit anywhere and still hold contrast.

Cheap, robust across viewport sizes, and it survives a video whose framing you don't
fully control. Worth reaching for when the backdrop is footage rather than a scene you
can re-frame.

Supporting devices, all DOM: a fixed hairline rule down the left edge, mono uppercase
micro-labels tagging sections, a small dark pill CTA. The premium read comes from
typography and restraint, not from the GPU.

## Where it fails the budgets in this skill

24.8 MB total, 24.4 MB of it video, is roughly 16x the brand-hero budget in
`performance.md`. Two films are fetched — one autoplaying, one for a later section —
and there is no evidence of connection-aware or Save-Data gating.

They do get the poster pattern right (a 72 KB poster image accompanies the autoplaying
film), and the videos are muted and looping, which is the correct baseline.

This is the trade awards-tier sites routinely make: extraordinary on a fast connection
and a large screen, expensive everywhere else. On a metered Indian or African mobile
connection, 24 MB is not a design decision, it's an exclusion.

If a client points at this site and asks for the same feeling, the honest answer is that
most of the feeling comes from typography, restraint and one blurred film — and you can
have that for under 3 MB by encoding shorter loops, serving AV1/WebM with an MP4
fallback, gating the second film behind scroll proximity, and dropping to the poster
under Save-Data.

## Structural notes

- Single `<section>` and one `<img>` in the DOM means the page is almost entirely
  JS-constructed. That is an SEO and no-JS risk this skill would flag in Phase 5 — worth
  verifying against a crawler view before copying the approach.
- 53 viewports of scroll is a very long narrative commitment. It works for a studio
  selling craft to a small number of intentional visitors. It would not work for a
  service business whose visitors arrive needing a price and a phone number.
- One bundle, one stylesheet, self-hosted fonts, no third-party scripts, no analytics.
  The dependency discipline is genuinely tight, and it is a large part of why the site
  feels fast despite the payload.

## What to take into a build

1. Use WebGL for what only WebGL can do; hand the rest to DOM, CSS and video.
2. A defocused film backdrop is a legitimate alternative to a rendered scene, and often
   more convincing when the subject is photographic.
3. Blur the background to create a quiet region when you can't re-frame the subject.
4. Typography and restraint carry more of the premium read than any effect.
5. Self-host fonts, ship one bundle, add no third-party scripts.
6. Do not copy the payload. Take the art direction and hold the budget.
