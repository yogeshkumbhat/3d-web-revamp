# Art direction

Generic 3D sites all look alike because they're built in the same order: scene, then
lighting, then "let's make it look nice." Decide the look first and the technical choices
fall out of it — which is also how you avoid burning a day on post-processing that fights
the mood.

## Write the direction down first

One paragraph, before any scene code. It should be specific enough that two different
developers would build recognisably the same thing:

> Precision and cold restraint. A single matte-anodised aluminium object on near-black,
> lit by one large soft key from high-left and a thin cyan rim from behind-right. No
> texture noise, no bloom. The object rotates 12° on cursor, never freely — control is
> implied, not given. Type is tight, small, and sits well clear of the object rather than
> over it.

Compare that to "a cool 3D hero with nice lighting." The first one builds itself.

## The five decisions

### 1. Emotion and archetype

Pick one dominant feeling and one archetype, and let everything serve it.

Common pairs that work:
- **Precision / instrument** — hard edges, cool metals, controlled camera, near-black ground
- **Warmth / craft** — clay and wood, soft warm key, gentle drift, cream or sand ground
- **Weight / permanence** — dense stone or dark metal, slow camera, deep shadow
- **Weightlessness / possibility** — glass, translucency, particles, pale infinite ground
- **Energy / play** — saturated plastics, bouncy easing, bright even light

Mixing two of these is the most common cause of a scene that reads as "AI-generated."

### 2. Material language

Choose two, maybe three materials. More reads as a sampler.

- **Glass / transmission** — `MeshPhysicalMaterial` with transmission, thickness, IOR ~1.5.
  Expensive; on mobile fake it with a lower-res render target or drop to a frosted matte.
- **Brushed / anodised metal** — metalness 1, roughness 0.25–0.45, anisotropic highlight.
  Needs a real environment map to look like anything.
- **Clay / matte** — roughness 0.8+, metalness 0. Forgiving, cheap, ages well.
- **Volumetric fog / atmosphere** — exponential fog plus a few soft light shafts. Reads as
  expensive, costs almost nothing.
- **Translucent plastic** — subtle subsurface via thickness map, or fake with rim + fresnel.

Materials only look good against a matching environment. An HDRI (or a procedurally
generated gradient environment) is what makes metal read as metal.

### 3. Light

Three-point still works. One large soft key doing 70% of the work, a fill at 20% to keep
shadows from going dead, a rim to separate subject from ground.

Decide the key colour and the ambient colour and make them slightly different — a warm key
against a cool ambient is most of what "cinematic" means in practice.

Bake what you can. Real-time shadows from more than one light source is usually the first
thing that ruins the mobile frame budget.

### 4. Camera

Decide what the user controls. This is a bigger design decision than it looks.

- **No control** — camera is choreographed. Most reliable, most cinematic, best on mobile.
- **Constrained** — cursor nudges the camera a few degrees with damping. Feels alive
  without letting anyone find the untextured back of the model. Default choice for heroes.
- **Free orbit** — only when inspection is the point (configurators). Always clamp polar
  angle and zoom, always damp, always provide a reset.

Free orbit on a brand hero is almost always wrong: it lets users break the composition you
designed, and on touch it fights page scroll.

### 5. Type against the 3D layer

The failure mode is HTML type floating over a busy scene at low contrast.

- Keep a quiet region in the composition where type lives — plan for it in the camera framing
- If type must sit over the scene, put a subtle gradient scrim behind it, not a blur filter
- Check contrast against the *brightest frame* of any animation, not a static screenshot
- Don't render type in the 3D scene unless it's part of the artwork; DOM type is sharper,
  selectable, accessible, and free

## Reference gathering

Ask the user for two or three sites whose *feeling* they want — not features. Then
characterise what actually creates that feeling (usually: restraint, one strong material,
one strong light, and slower motion than expected) rather than copying the surface.

If they name an awards-site aesthetic, be honest that those sites often trade heavily
against performance and accessibility, and propose which of those trades you're willing to
make on their site.

## Motion feel

- Slower than instinct. Most 3D web motion is 30–50% too fast.
- Ease out, long tail. `power2.out` or a critically-damped spring, not linear.
- Damping on anything cursor-driven; raw pointer values always feel cheap.
- One thing moves at a time. Simultaneous camera, object and light motion reads as noise.
- Idle motion should be almost imperceptible — a 2–4 second breathing drift, not a spin.

A rotating object on a loop is the visual equivalent of a stock photo. Give the motion a
reason: it responds to the cursor, it settles after load, it reveals the next section.
