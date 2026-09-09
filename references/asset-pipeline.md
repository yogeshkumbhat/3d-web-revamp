# Asset pipeline

Uncompressed 3D assets are the reason most 3D sites are slow. This is a solved problem with
tooling; the failure is that people skip it. A typical source `.glb` from a designer is
40–80MB and should ship at 0.6–1.5MB.

## The chain

```
source (.blend / .fbx / .obj)
  → glTF 2.0 (.glb)                 single binary file
  → geometry compression            Draco or meshopt
  → texture compression             KTX2 / Basis Universal
  → prune, dedupe, resample
  → ship
```

Run `scripts/optimize_assets.sh <input.glb>` to do this and report before/after sizes
against budget.

## Tooling

`gltf-transform` (npm, CLI) does nearly all of it:

```bash
npm i -g @gltf-transform/cli

gltf-transform optimize in.glb out.glb \
  --compress meshopt \
  --texture-compress ktx2 \
  --texture-size 2048 \
  --simplify true --simplify-error 0.001
```

Useful individual passes when the one-shot `optimize` is too aggressive:

```bash
gltf-transform prune in.glb out.glb          # drop unused nodes, materials, textures
gltf-transform dedup in.glb out.glb          # merge duplicate accessors/materials
gltf-transform weld in.glb out.glb           # merge coincident vertices
gltf-transform resize in.glb out.glb --width 2048 --height 2048
gltf-transform meshopt in.glb out.glb --level high
gltf-transform draco in.glb out.glb          # alternative to meshopt
gltf-transform uastc in.glb out.glb --level 4 --rdo 4     # high-quality KTX2
gltf-transform etc1s in.glb out.glb --quality 200         # small KTX2, lossier
gltf-transform inspect out.glb               # verify: triangles, textures, materials
```

## Draco vs meshopt

| | Draco | meshopt |
|---|---|---|
| Compression | Slightly better | Very good |
| Decode speed | Slower, heavier decoder | Much faster, ~30KB decoder |
| Animation support | Weak | Good |
| Default choice | Static, huge geometry, size-critical | **Everything else** |

Prefer meshopt. The decode-time difference is visible on mid-tier phones, which is exactly
where you're already struggling.

## Textures

Textures are usually a bigger win than geometry — an unoptimised model is often 80% texture.

- **KTX2 / Basis Universal** stays compressed in GPU memory, unlike JPEG/PNG which decode
  to raw RGBA. A 2048² PNG occupies ~16MB of VRAM; the KTX2 equivalent is ~2.7MB. On mobile,
  VRAM is the constraint that actually bites.
- **UASTC** for normal maps and anything where quality matters; **ETC1S** for colour maps
  where it doesn't.
- **2048 desktop, 1024 mobile.** Ship both and pick by tier. Above 2048 is essentially never
  justified on the web.
- **Pack ORM channels** — occlusion in R, roughness in G, metalness in B. One texture
  instead of three.
- Requires `KTX2Loader` with transcoder files served from your own origin.

## Budget by category

Gzipped, above the fold, including the Three runtime:

| Category | Geometry | Textures | Total |
|---|---|---|---|
| Brand hero | ≤400KB | ≤600KB | ≤1.5MB |
| Configurator (first product) | ≤700KB | ≤1MB | ≤2.5MB |
| Narrative (first section) | ≤1MB | ≤1.5MB | ≤4MB |

Triangle ceilings: 150k hero, 300k per product, 500k narrative section. Most well-modelled
web assets land far below these — 80k triangles is plenty for a chair.

## Environment maps

- 1k HDRI is enough for a web hero; 2k only if a large mirror-finish surface shows the
  detail. 4k is never justified.
- Compress to `.hdr` → KTX2 or use RGBE-packed PNG.
- **Cheapest option: generate the environment procedurally.** A gradient sky with two
  emissive area lights rendered once to a cube render target gives convincing material
  response for ~0 bytes. Good default when there's no HDRI budget.

## When there are no models

Common in service-business revamps: no product, no 3D artist, no budget. Options that still
look intentional:

1. **Procedural geometry** — parametric forms built in code. Zero download, infinitely
   tweakable, and forces a distinctive look because you can't reach for a stock asset.
2. **Shader-only scenes** — a full-screen fragment shader: raymarched forms, flow fields,
   gradient meshes. A few KB, and among the most distinctive results available.
3. **GPU particles** — points sampled from a surface or forming a shape. Cheap in bytes,
   expensive in fill rate; cap the count per tier.
4. **Typographic 3D** — extrude the logo or a headline word with `TextGeometry` or an
   imported font path. On-brand by construction.
5. **CSS 3D transforms** — layered parallax, card flips, perspective grids. No WebGL at all,
   works everywhere, degrades perfectly. Frequently the right answer for a service site.
6. **Photogrammetry** — if the product is physical, a phone scan plus cleanup is a real
   option now and costs a day.

Option 5 deserves more consideration than it gets. A well-executed CSS-3D site loads in
under 200KB, works on every device, and reads as more polished than a janky WebGL scene.

## Model conventions

Specify these to whoever supplies models, before they start:

- glTF 2.0 binary (`.glb`), Y-up, metres, real-world scale
- Origin at the base centre, transforms applied, no non-uniform scale in the hierarchy
- One UV set, non-overlapping, no textures above 2048
- PBR metal-rough workflow only
- Descriptive mesh and material names — they become your variant switching API
- No cameras, no lights, no unused nodes in the export

Getting this in writing up front saves a full day per model of cleanup later.

## Verify before shipping

```bash
gltf-transform inspect final.glb
```

Check: triangle count against budget, texture count and resolution, no duplicate materials,
no leftover unused nodes. Then load it and confirm materials still look right — aggressive
simplification can wreck normals and produce faceted shading on curved surfaces.
