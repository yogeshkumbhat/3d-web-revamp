# Anti-patterns

Failure modes that recur in almost every 3D web build. Each one is cheap to avoid up
front and expensive to fix after launch. If you're about to do one of these, don't.

## Architecture

**Building the scene first and retrofitting the fallback.** The fallback becomes an
afterthought and it shows — usually a blank rectangle. Build static-first: content,
poster, then scene.

**Mounting the scene during hydration.** Blocks the main thread at exactly the moment
INP is measured. Lazy-mount after first paint.

**Making the canvas the LCP element.** Guarantees a poor LCP no matter how fast the
scene is. The poster is the LCP element.

**A client-only 3D app with no server-rendered content.** Bets your SEO on crawler JS
execution. Prerender or SSR the content layer.

**One giant `<Canvas>` wrapping the whole page.** Ties every UI rerender to the render
loop. Keep the scene in its own subtree with its own state.

**Rendering in a background tab.** Stop the loop on `document.hidden`, or you'll get
battery complaints.

## Performance

**Uncapped `devicePixelRatio`.** On a 3x phone this renders 9x the pixels. The single
most common cause of unplayable mobile frame rates. `Math.min(devicePixelRatio, 1.5)`.

**Multiple shadow-casting lights.** Each one is another full scene render. One
shadow-casting light, or bake a contact shadow.

**Post-processing on mobile.** Every pass is another full-screen render on the most
fill-rate-limited hardware you'll encounter. Drop it below the high tier.

**Allocating in the render loop.** `new THREE.Vector3()` sixty times a second produces
GC pauses that profile as mysterious stutter. Hoist and reuse.

**Testing for fifteen seconds.** Thermal throttling appears at 60–120 seconds. A scene
that passes a short test and dies at two minutes has failed.

**Trusting `navigator.deviceMemory`.** Chromium-only — Safari and Firefox return
`undefined`. Treating that as "low" locks out a third of desktop users. Missing signals
mean unknown, not bad.

**Assuming the desktop CI number is the real number.** A CI container is not a
mid-tier Android. Measure on real hardware before writing numbers in a report.

**Shipping uncompressed glTF.** A designer export is routinely 40–80MB and should ship
at 0.6–1.5MB. There is a CLI for this; use it.

**Shipping PNG/JPEG textures.** They decode to raw RGBA in VRAM — a 2048² PNG occupies
~16MB. KTX2 stays compressed on the GPU at roughly a sixth of that.

## Interaction

**Free orbit on a brand hero.** Lets users find the untextured underside and break the
composition you designed. Constrain to a damped tilt.

**Raw pointer values with no damping.** Always feels cheap. Lerp toward a target.

**Scroll-jacking.** Trapping the wheel to force a fixed sequence is the most disliked
pattern in this category. Let people scroll fast, backwards, and away.

**Pointer-events on a decorative canvas.** Eats text selection and link clicks in ways
that are maddening to debug. `pointer-events: none` unless it's genuinely interactive.

**Hijacking touch-move on mobile.** Fights native scroll. Use autonomous drift instead
of pointer tracking on touch devices.

**Constant-speed rotation as the whole idea.** The visual equivalent of a stock photo.
Give motion a reason: it settles, it responds, it reveals.

## Accessibility

**Reduced motion as "the same thing, slower".** Scroll-linked camera movement is
precisely what triggers vestibular symptoms; slowing it doesn't help. Ship stillness.

**Meaningful text rendered as 3D geometry.** Invisible to screen readers, find-in-page,
translation and selection. DOM type is sharper, free, and accessible.

**A configurator whose variants are canvas-only.** Those are shopping controls. They
must be real buttons with accessible names and keyboard access.

**`aria-label` on a decorative canvas.** Makes screen reader users navigate an abstract
visual for no benefit. `aria-hidden="true"` when decorative.

**Contrast checked against a screenshot.** Check against the brightest frame of the
animation, or your type will fail contrast for part of every loop.

**Smooth-scroll libraries shipped untested with a keyboard.** They routinely break
find-in-page, Home/End, and screen-reader cursor tracking.

## Art direction

**Starting with `new THREE.Scene()` and deciding the feeling afterwards.** This is why
generic 3D sites all look alike. Write the direction down first.

**Mixing two archetypes.** Warm craft and cold precision in one scene reads as
machine-generated. Pick one and let everything serve it.

**No environment map.** Metal renders as grey plastic. An HDRI or a procedurally
generated environment is what makes materials read as materials.

**No ground contact.** The object floats. A contact shadow is the cheapest realism
available.

**Motion at instinctive speed.** Almost all web 3D motion is 30–50% too fast. Slow it
and add a longer ease-out tail.

**Type over the busiest part of the frame.** Plan a quiet region into the camera
framing rather than fixing it with a blur afterwards.

**Five materials in one scene.** Reads as a sampler. Two, maybe three.

**An abstract blob for an intangible service.** Says nothing and could sit on any
competitor's site. Either find a specific metaphor or use a typographic treatment.

## Process

**Rewriting the copy during a visual revamp.** Changes two variables at once, so you
can't attribute a conversion change to either. Port the copy, then iterate on it.

**Dropping pages silently.** The most common regression in redesigns. Inventory first,
get removals signed off.

**Hand-exporting the poster.** It drifts the moment the scene changes. Generate it from
the scene in the build.

**No baseline measurement.** Without the old site's numbers you can't prove the new one
is better, and you won't notice if it's worse.

**Claiming a checklist passed without measuring.** A checklist filled in from
assumptions transfers confidence without transferring evidence, which is worse than no
checklist at all.
