# Narrative / scroll-driven scene

The site *is* the 3D world; scroll moves a camera through it. Highest impact, hardest to
ship well. Almost all of the difficulty is mobile.

Commit to this only when there's a story worth telling and traffic will be intentional. It
is the wrong choice for a site people arrive at needing a phone number.

## Structure

Model it as **sections**, not one continuous timeline. Each section owns a camera pose, a
scene state, and a block of DOM content. Scroll interpolates between adjacent section
states.

```js
const SECTIONS = [
  { id: 'intro',   camera: { pos: [0, 1.6, 8], look: [0, 1, 0] }, reveal: [] },
  { id: 'process', camera: { pos: [4, 2.2, 3], look: [0, 1, 0] }, reveal: ['machine'] },
  { id: 'result',  camera: { pos: [0, 0.8, 1.6], look: [0, 0.8, 0] }, reveal: ['product'] },
];
```

This beats one long baked animation because content edits don't force re-choreographing
everything, and each section can be tested and deep-linked in isolation.

## Scroll binding

**Bind to scroll position, never to scroll events.** Read the position in the render loop
and lerp toward it. Driving the camera directly from scroll events gives you jitter on
every trackpad and stutter on every phone.

```js
// in the render loop
targetProgress = window.scrollY / (document.body.scrollHeight - innerHeight);
progress += (targetProgress - progress) * 0.08;   // damping is what makes it feel good
updateCamera(progress);
```

Smooth-scroll libraries (Lenis) improve feel on desktop, but they take over the scrollbar.
That has real costs: browser find-in-page scrolling breaks, keyboard scrolling can behave
oddly, and accessibility tooling gets confused. Use it deliberately, test with keyboard
only, and disable it under `prefers-reduced-motion`.

**Never scroll-jack.** Trapping the wheel to force a fixed sequence is the single most
hated pattern in this category. Let the user scroll fast, scroll backwards, and leave.

## Camera choreography

- Move along a smooth path (`CatmullRomCurve3`) rather than lerping between poses — direct
  lerping produces a mechanical, cutting-corners feel
- Decouple position from look-at target; both interpolate independently
- Never roll the camera unless the story demands it; it reads as nausea
- Keep velocity roughly constant; sudden accelerations tied to a scroll flick feel broken
- Test at fast scroll. If flinging to the bottom looks like a seizure, add more damping and
  clamp the maximum per-frame delta

## Content overlay

The DOM sections scroll normally; the canvas is `position: fixed` behind them.

```css
.scene { position: fixed; inset: 0; z-index: 0; pointer-events: none; }
.content { position: relative; z-index: 1; }
```

`pointer-events: none` on the canvas unless the scene is genuinely interactive — otherwise
it eats text selection and link clicks in ways that are maddening to debug.

Each section needs a readable region. Plan the camera framing so the 3D is never behind the
type at the moment that type is visible.

## Mobile — where these break

This is where most scroll-driven sites die. Budget real time for it.

- **`100vh` is a lie.** Mobile browser chrome resizes the viewport mid-scroll, which
  changes the scroll height, which jumps your progress value. Use `100dvh`, and recompute
  scroll bounds on `resize` with a debounce.
- **`position: fixed` misbehaves during momentum scroll on iOS.** Test on a real device;
  simulators do not reproduce it.
- **Thermal throttling.** A phone rendering a full scene for two minutes of scrolling
  throttles hard. Test for three minutes continuously, not fifteen seconds.
- **Scroll-linked rendering drains battery.** Skip frames when scroll delta is zero — if
  nothing changed, don't render.
- **Touch scroll velocity differs wildly from wheel.** Tune damping separately per input type.

Serious option worth considering: on the low tier, drop the continuous camera path entirely
and give each section a static, well-composed render with a cross-fade between them. Users
on those devices get a coherent, fast experience instead of a stuttering one. Most won't
know what they missed.

## Preloading

Nothing is worse than scrolling into an empty section.

- Load section 1 assets before revealing the page; show a real loader with progress
- Preload section N+1 during section N via `requestIdleCallback`
- If an asset isn't ready, hold the camera at the section boundary rather than flying into
  a void
- Keep the loader short. Over ~4 seconds and you're losing a meaningful share of visitors
  before they see anything

## Sound

If there's audio: muted by default (browsers require it), a persistent visible toggle, and
state remembered. Crossfade between sections rather than cutting. Never autoplay with sound
— it's a bounce guarantee and a policy violation on most platforms.

## Reduced motion

`prefers-reduced-motion: reduce` cannot mean "the same journey, slower." Scroll-linked
camera movement is exactly what triggers vestibular symptoms.

Ship a genuinely different experience: normal document scroll, static rendered images per
section, no camera motion at all. Same content, same order, same conclusions — just still.
That path also serves crawlers, no-WebGL browsers and the low device tier, so build it once
and reuse it in all four cases.
