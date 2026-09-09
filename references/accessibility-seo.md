# Accessibility, fallbacks and SEO

A canvas is an opaque bitmap to a screen reader, a crawler, a translation tool, find-in-page
and text selection. Everything meaningful therefore lives in the DOM, and the canvas
visualises it. Build it that way from the start — retrofitting is much harder than it sounds.

## The four audiences who never see your scene

Design for all four with the same static path, built once:

1. **Crawlers** — need real HTML content and metadata
2. **`prefers-reduced-motion` users** — need stillness, not slower motion
3. **No-WebGL / lost context / blocked GPU** — need a poster
4. **Low-tier devices** — better served by the static path than a 12fps one

That's a meaningful share of real traffic. It is not an edge case.

## Content in the DOM

Rule: if the information exists only inside the scene, it doesn't exist.

- Headings, copy, CTAs, product names, prices, variant names — all real HTML
- Never render meaningful text as 3D geometry without a DOM equivalent
- Structured data (`Product`, `Organization`, `BreadcrumbList`) ported from the old site
- The page must be readable and navigable with JavaScript disabled entirely

Test: disable JavaScript. If the page is blank or missing content, the architecture is
wrong.

## Reduced motion

```js
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
if (reduce.matches) mountStatic(); else mountScene();
reduce.addEventListener('change', handleChange);  // people toggle it mid-session
```

Reduced motion means **no camera movement, no scroll-linked motion, no autoplay animation**.
A slowed-down version of the same journey still triggers vestibular symptoms — that's the
whole point of the setting.

The acceptable version: static rendered images, cross-faded at most, or no motion at all.
Content and conclusions identical.

## The poster fallback

Every canvas container ships with one:

```html
<div class="scene-container">
  <picture class="scene-poster">
    <source srcset="/hero.avif" type="image/avif">
    <source srcset="/hero.webp" type="image/webp">
    <img src="/hero.jpg" alt="" width="1600" height="900" fetchpriority="high">
  </picture>
  <canvas aria-hidden="true"></canvas>
</div>
```

Render the poster from the actual scene so the two match. Reveal the canvas only after the
first frame renders, and cross-fade — a hard swap reads as a flash.

`alt=""` when decorative. If the image carries meaning (a product), write a real alt.

## Canvas semantics

- **Decorative scene:** `aria-hidden="true"` on the canvas, no tab stop. Don't make screen
  reader users navigate an abstract visual.
- **Meaningful scene (configurator):** the state is expressed in DOM controls; the canvas
  stays `aria-hidden`. Announce changes through the controls, not the canvas.
- **Genuinely interactive scene (a 3D map, a game):** the canvas needs `role`, `tabindex="0"`,
  an accessible name, keyboard controls and a text alternative describing what it contains.
  This is real work — scope it, don't hand-wave it.

## Keyboard

Every action available by mouse or touch must be available by keyboard.

- Variant selection: real `<button>` elements, arrow-key navigation within a group,
  `aria-pressed` for state
- Camera views: named preset buttons ("Front", "Side", "Detail") rather than expecting
  keyboard orbit
- Visible focus indicators that survive the dark background — test them against the scene
- Focus must never be trapped in or lost to the canvas

## Scroll and smooth-scroll libraries

Smooth-scroll libraries can break:
- browser find-in-page scrolling to matches
- Home / End / Page Up / Page Down
- screen reader virtual cursor tracking
- scroll anchoring on dynamic content

Test with keyboard only and with a screen reader before shipping one. Disable it under
reduced motion.

## SEO specifics

- Prerender or server-render. A client-only 3D app is a gamble on crawler JS execution.
- Poster images get real filenames and alt text; they're the images that will surface in
  image search.
- Keep URLs from the old site or map 301s exactly one-to-one.
- Preserve meta titles, descriptions, canonicals, OG and Twitter tags.
- Core Web Vitals are a ranking input — the performance budget in `performance.md` is an SEO
  requirement, not just a nicety.
- Don't lazy-load above-the-fold content behind the scene loader; crawlers may not wait.

## Motion sensitivity beyond the media query

Not everyone with vestibular sensitivity has the OS setting enabled.

- Provide a visible motion toggle for scroll-driven sites, near the top, state remembered
- Avoid rapid full-screen brightness changes and high-frequency flicker (seizure risk —
  nothing flashing more than 3 times per second)
- Avoid camera roll, and avoid rapid field-of-view changes

## Colour and contrast

- Test UI contrast against the **brightest frame** of the animation, not a screenshot
- 4.5:1 for body text, 3:1 for large text and UI components, over whatever is behind it
- If contrast can't be guaranteed across the animation, add a scrim behind the type — a
  subtle gradient reads better than a blur
- Never rely on colour alone to convey a variant selection; pair with a label and a
  checked state

## Quick test list

- [ ] JavaScript disabled → full content readable
- [ ] `prefers-reduced-motion: reduce` → static, no camera motion
- [ ] WebGL blocked (`chrome://flags` or a blocking extension) → poster, site works
- [ ] Keyboard only → every interaction reachable, focus always visible
- [ ] Screen reader (VoiceOver / NVDA) → content in a sensible order, no canvas noise
- [ ] Force context loss (`WEBGL_lose_context` extension) → recovers or falls back cleanly
- [ ] 200% browser zoom → layout holds
- [ ] Crawler view (Search Console URL inspection) → content present
