# Brand / service hero scene

One 3D moment, above the fold, everything else static. The job is to signal craft in about
two seconds and then get out of the way so the visitor can read what you do.

This is the most requested and most badly executed category. Restraint is the entire skill.

## The rules that make it work

**One moment, one screen.** If there's a second 3D section, you've built a narrative site —
go read `scroll-scene.md` instead and commit properly. Half-committing gives you the load
cost of an immersive site and the impact of neither.

**The scene never blocks the message.** Headline, subhead and primary CTA are readable
before the scene finishes loading, and remain readable at every frame of the animation.

**Motion is ambient, not demanding.** A slow drift, a cursor-damped tilt, a settle after
load. Nothing that pulls the eye away from the copy after the first two seconds.

**Budget: 1.5MB gzipped, hard.** This includes the Three runtime. That constraint is what
forces the good decisions.

## What to put in the scene

Ranked by how well it works in practice:

1. **The actual product or artefact.** Always strongest if one exists. Hardware, packaging,
   a device, a physical deliverable.
2. **A material study.** An abstract form whose entire purpose is showing one material
   beautifully — glass with real transmission, brushed metal with a moving highlight,
   liquid metal. Reads as craft rather than as a stock asset.
3. **A physical metaphor for an intangible service.** Only if it's specific. "Network of
   nodes" for a data company is the visual equivalent of a handshake stock photo. A
   precisely engineered mechanism for a precision-engineering consultancy is not.
4. **Typographic 3D.** The logo or a key word as a physical object with real material and
   light. Cheap, always on-brand, hard to get wrong.
5. **Particles and shader fields.** Beautiful, cheap in bytes, and says nothing about the
   business. Fine as texture, weak as the whole idea.

Avoid: generic floating geometry, a spinning globe, abstract blobs, anything that would fit
equally well on a competitor's site.

## Cheap effects that look expensive

Ordered by value per kilobyte:

- **Contact shadows and soft ambient occlusion** — more perceived quality than any
  post-processing effect
- **A good environment map** — a 1k HDRI, or generated procedurally from a gradient, is
  what makes materials read as real
- **Fresnel rim on the silhouette** — a few lines of shader, enormous separation from the
  background
- **Volumetric fog with one light shaft** — depth for almost nothing
- **Slow HDRI rotation** — the highlight travels across the material, and the scene feels
  alive with zero geometry animation
- **Subtle film grain over everything** — hides banding, unifies the image, ~1KB

Skip unless the budget is genuinely spare: bloom (usually just makes things look blurry),
depth of field (expensive, and browsers render it worse than you remember), SSR, SSAO.

## Cursor interaction

The default: damped tilt, small range.

```js
// target follows pointer, camera lerps toward target — never assign directly
targetX = (pointerX / innerWidth - 0.5) * 0.24;   // radians, ~14° total range
targetY = (pointerY / innerHeight - 0.5) * 0.14;

// each frame
current.x += (targetX - current.x) * 0.045;
current.y += (targetY - current.y) * 0.045;
```

Small ranges and heavy damping. A hero that swings wildly with the cursor feels like a toy.

On touch, drop pointer tracking entirely and use a gentle autonomous drift — touch devices
have no hover, and hijacking touch-move fights scroll.

## The static fallback is a first-class deliverable

Most of this site's visitors on a bad connection or a locked-down browser will only ever
see the poster. It should be a genuinely good hero image — render it out of the same scene
at high quality, export AVIF and WebP, and treat it as the LCP element.

If it doesn't look good enough to ship on its own, the scene isn't well art-directed yet.

## Common failure modes

| Symptom | Cause | Fix |
|---|---|---|
| "Feels like a template" | Motion is a constant-speed rotation | Give the motion a reason — settle, respond, reveal |
| Copy is hard to read | Type sits over the busiest part of the frame | Reframe the camera to leave a quiet region |
| Great on desktop, awful on phone | Uncapped DPR, real-time shadows | Cap DPR at 1.5, bake or drop shadows on the low tier |
| Slow first paint | Scene mounts during hydration | Lazy-mount after first paint behind an IntersectionObserver |
| Looks flat and plasticky | No environment map | Add a 1k HDRI or a procedural gradient environment |
| Fine alone, ruins the page | 3D competing with the CTA | Reduce motion amplitude, darken the scene, raise type contrast |
