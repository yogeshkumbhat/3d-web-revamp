# Product configurator (commerce)

The only 3D category with a direct revenue argument: it answers the buyer's spatial
questions and cuts returns. Build it as a shopping tool that happens to be 3D, not a 3D
scene that happens to sell something.

## What actually moves conversion

In rough order of value:

1. **Real variant switching** — the buyer's actual colour, finish and configuration, not a
   representative sample
2. **Scale reference** — a human silhouette, a door, a coffee cup. "How big is it" is the
   most common unanswered question in online furniture and hardware
3. **AR view on mobile** — "place it in my room" closes the loop that 3D opens
4. **Detail zoom on the parts people worry about** — the stitching, the hinge, the port
   layout, the underside
5. **Configuration that carries into the cart** — the selected state must produce a real
   SKU, price and add-to-cart

A rotating model with no variants and no scale cue is decoration. It costs load time and
answers nothing.

## Scene setup

Product photography rules apply more than game rendering rules.

- **Neutral studio environment.** A soft HDRI or a three-light softbox rig. The product is
  the subject; the environment exists to describe its material.
- **Ground contact.** A contact shadow (drei `<ContactShadows>` or a baked AO plane) is
  what stops the product looking like it's floating. Cheapest realism available.
- **Colour accuracy is a commercial obligation.** If the site says "sand", the render must
  read as sand under sRGB with ACES tone mapping. Calibrate against the real product photo
  and be prepared to hand-tune material values until they match.
- **Constrained orbit.** Clamp polar angle so the buyer can't look at the untextured
  underside. Clamp zoom. Damp everything. Provide a reset button.
- **Auto-rotate on idle, stop on interaction, never resume mid-interaction.**

## Variant architecture

Do not ship one model per variant. Ship one model and swap material properties.

```js
// variants.js — data, not logic
export const FINISHES = {
  sand:     { color: '#D9C9A8', roughness: 0.72, metalness: 0.0, map: 'fabric_a' },
  charcoal: { color: '#2B2B2E', roughness: 0.68, metalness: 0.0, map: 'fabric_a' },
  brass:    { color: '#C9A227', roughness: 0.30, metalness: 1.0, map: null },
};
```

For geometry variants (with/without armrests, three sizes), use a single glTF with named
mesh groups and toggle `visible`. One download, instant switching, no loading spinner
between choices — and the spinner between choices is what kills configurator engagement.

If variants genuinely need separate geometry, preload the two most-selected on idle via
`requestIdleCallback` and lazily fetch the rest.

## Multi-SKU catalogues

The hard part of commerce 3D isn't one product, it's forty.

- Establish one material library and one lighting rig shared across every SKU. Per-product
  art direction does not scale and makes the catalogue look inconsistent.
- Standardise model conventions before commissioning anything: Y-up, metres, origin at the
  base centre, real-world scale, one UV set, max texture 2048, naming scheme for meshes and
  materials. Send this as a spec sheet to whoever supplies models.
- Share environment maps and textures across products so the browser caches them once.
- Automate the compression pipeline (`scripts/optimize_assets.sh`) in CI, not by hand.
- Budget per product: ≤1.5MB geometry + textures gzipped after the shared libs and env are
  already cached.

## AR handoff

Cheapest high-value feature in this category. No extra runtime needed:

- iOS: USDZ via AR Quick Look — `<a rel="ar" href="model.usdz"><img …></a>`
- Android: GLB via Scene Viewer intent URL
- Or use `<model-viewer>` for the AR entry point specifically, even if your main scene is
  custom — it handles both platforms and the fallbacks

Generate USDZ from the same source glTF as part of the asset pipeline so the two never
drift apart.

## Commerce integration

- Selected configuration must map to a real SKU and price, updated live
- Encode configuration in the URL so it's shareable and recoverable —
  `?finish=sand&size=3seat`. Buyers share configurations with partners before purchasing;
  this is a real behaviour and losing it costs sales
- Add-to-cart passes the configuration through to the order — not just the base product
- Fire analytics on variant changes; the data tells you which finishes to stock

## Performance specifics

Configurators get more scrutiny than heroes because the user stays on the page.

- ≤2.5MB gzipped for first product including shared libs and environment
- Variant switch must feel instant — under 100ms. If it needs a fetch, preload it
- 300k triangles is a generous ceiling for a single product; most furniture reads fine at 80k
- Textures at 2048 desktop / 1024 mobile, KTX2 compressed
- Progressive load: show a low-poly or lower-res texture version immediately, upgrade in
  place. Blank canvas while a 2MB model downloads is worse than a rough model that sharpens

## Accessibility

The configurator's controls are shopping controls. They are not optional.

- Every variant is a real `<button>` in the DOM with an accessible name, in a labelled
  group, keyboard reachable, with visible focus
- The current selection is announced — `aria-pressed` or a live region
- The canvas is `aria-hidden`; it's a visualisation of state that's already expressed in
  the DOM
- Without WebGL, the same buttons swap a photograph of each variant. Everything still works
- Provide real product photography as the fallback. A configurator that degrades to
  nothing on a mid-range Android is losing exactly the customers who most need convincing
