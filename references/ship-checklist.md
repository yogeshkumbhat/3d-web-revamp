# Ship checklist

Run this honestly before calling the build done. Report it to the user as pass/fail with
real measured numbers. A checklist filled in from assumptions is worse than no checklist,
because it transfers confidence without transferring evidence.

## Content parity (revamp only)

- [ ] Every URL from the audit exists, or has an exact 301
- [ ] Every piece of copy is present, or its removal was signed off
- [ ] Meta titles, descriptions and canonicals ported
- [ ] Structured data / JSON-LD ported and validated
- [ ] Forms submit to the correct endpoint; a test submission was received
- [ ] Analytics, pixels and tag manager firing; a test event was confirmed
- [ ] Third-party embeds (booking, chat, reviews) still working
- [ ] All CTAs point somewhere correct

## Performance — measured, not estimated

On a real mid-tier Android over throttled 4G:

- [ ] LCP < 2.5s — measured: ____
- [ ] The LCP element is the poster/hero image, not the canvas
- [ ] INP < 200ms — measured: ____
- [ ] CLS < 0.1 — measured: ____
- [ ] First scene frame < 3.5s — measured: ____
- [ ] Frame time p95 < 22ms mobile — measured: ____
- [ ] Three minutes sustained without visible throttling — measured: ____
- [ ] 3D payload gzipped within category budget — measured: ____
- [ ] Draw calls within budget — measured: ____
- [ ] No long task > 50ms after first paint
- [ ] `renderer.info.memory` stable over a five-minute session (no leak)

## Fallbacks

- [ ] JavaScript disabled → full content readable and navigable
- [ ] `prefers-reduced-motion: reduce` → genuinely static, no camera motion
- [ ] WebGL unavailable → poster shown, everything else works
- [ ] Context loss forced → recovers or falls back without a black rectangle
- [ ] Low device tier → static path or reduced tier, never a stuttering full scene
- [ ] Save-Data enabled → static path

## Accessibility

- [ ] Keyboard only: every interaction reachable, focus visible throughout
- [ ] Screen reader pass: content in sensible order, no canvas noise, state announced
- [ ] Canvas correctly `aria-hidden` or correctly described
- [ ] Contrast checked against the brightest animation frame — 4.5:1 body, 3:1 large/UI
- [ ] Nothing flashing more than 3 times per second
- [ ] 200% zoom holds layout
- [ ] Motion toggle present and remembered (scroll-driven sites)

## Cross-device

- [ ] Real iPhone (Safari) — the `100dvh` and fixed-position issues appear here
- [ ] Real mid-range Android (Chrome)
- [ ] Desktop Safari — WebGL behaviour differs from Chrome more than you expect
- [ ] Firefox
- [ ] Tablet, both orientations
- [ ] Ultra-wide desktop — check composition doesn't break at 21:9
- [ ] Backgrounded tab then returned — context restored, loop resumed

## Craft

- [ ] Motion has a reason; nothing loops purely for decoration
- [ ] Type is readable at every frame
- [ ] The poster image would be good enough to ship on its own
- [ ] Loader is under 4 seconds and shows real progress
- [ ] No visible pop-in when assets upgrade
- [ ] Interaction is damped; nothing tracks raw pointer values
- [ ] The scene looks intentional rather than templated — it could not be dropped onto a
      competitor's site unchanged

## Handover

- [ ] Asset pipeline documented and reproducible (a command, not tribal knowledge)
- [ ] Model conventions spec written down for future assets
- [ ] Quality tiers documented so the next developer knows what drops where
- [ ] Poster regeneration documented — it must be updated when the scene changes
- [ ] Source models stored somewhere other than the repo's compressed output

## Reporting to the user

```
## Ship report

Content parity     PASS   38/38 URLs, all meta and JSON-LD ported
Performance        PASS   LCP 2.1s · p95 frame 18.4ms · 1.31MB · 38 draw calls
Fallbacks          PASS   no-JS, reduced-motion, no-WebGL, context loss all verified
Accessibility      PASS   keyboard + VoiceOver clean, contrast 5.2:1 worst frame
Cross-device       PASS   iPhone 13, Pixel 6a, Safari/Chrome/Firefox desktop

Traded away:
- Bloom on the hero, to hold the mobile frame budget. Difference is not visible
  at the final exposure setting.
```

If something failed, say so and say what it would take to fix. A build that ships with a
known failure the client understands is fine. One that ships with a failure nobody
mentioned is how 3D sites get their reputation.
