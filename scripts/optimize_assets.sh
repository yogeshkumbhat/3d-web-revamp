#!/usr/bin/env bash
#
# glTF/GLB optimisation pipeline with budget reporting.
#
# Takes a raw model export and produces a web-ready .glb: pruned, deduped,
# meshopt-compressed geometry, KTX2 textures, resized, with before/after sizes
# reported against the category budget.
#
# Usage:
#   ./optimize_assets.sh model.glb
#   ./optimize_assets.sh model.glb --category configurator --texture-size 1024
#   ./optimize_assets.sh model.glb --draco --simplify 0.002
#
# Categories and their gzipped budgets:
#   hero          1.5 MB    (default)
#   configurator  2.5 MB
#   narrative     4.0 MB
#
# Requires: @gltf-transform/cli (global install, or npx will fetch it)

set -euo pipefail

INPUT=""
CATEGORY="hero"
TEXTURE_SIZE=2048
COMPRESSION="meshopt"
SIMPLIFY=""
OUTDIR="./optimized"

usage() { sed -n '2,20p' "$0" | sed 's/^# \?//'; exit 1; }

while [[ $# -gt 0 ]]; do
  case $1 in
    --category)     CATEGORY="$2"; shift 2 ;;
    --texture-size) TEXTURE_SIZE="$2"; shift 2 ;;
    --draco)        COMPRESSION="draco"; shift ;;
    --meshopt)      COMPRESSION="meshopt"; shift ;;
    --simplify)     SIMPLIFY="$2"; shift 2 ;;
    --outdir)       OUTDIR="$2"; shift 2 ;;
    -h|--help)      usage ;;
    *)              INPUT="$1"; shift ;;
  esac
done

[[ -z "$INPUT" ]] && usage
[[ -f "$INPUT" ]] || { echo "No such file: $INPUT" >&2; exit 1; }

# Prefer a global install; fall back to npx so the pipeline runs on a clean machine
# (and in CI) without a global npm install, which often fails on permissions.
if command -v gltf-transform >/dev/null 2>&1; then
  GLTF() { gltf-transform "$@"; }
elif command -v npx >/dev/null 2>&1; then
  echo "gltf-transform not installed globally — using npx (first run downloads it)." >&2
  GLTF() { npx --yes --package @gltf-transform/cli gltf-transform "$@"; }
else
  echo "gltf-transform not found, and no npx to fall back on. Install with:" >&2
  echo "  npm i -g @gltf-transform/cli" >&2
  exit 1
fi

case "$CATEGORY" in
  hero)         BUDGET_BYTES=1572864  ; BUDGET_LABEL="1.5 MB" ; TRI_BUDGET=150000 ;;
  configurator) BUDGET_BYTES=2621440  ; BUDGET_LABEL="2.5 MB" ; TRI_BUDGET=300000 ;;
  narrative)    BUDGET_BYTES=4194304  ; BUDGET_LABEL="4.0 MB" ; TRI_BUDGET=500000 ;;
  *) echo "Unknown category: $CATEGORY (hero|configurator|narrative)" >&2; exit 1 ;;
esac

mkdir -p "$OUTDIR"
BASE="$(basename "${INPUT%.*}")"
OUTPUT="$OUTDIR/${BASE}.opt.glb"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

human() { awk -v b="$1" 'BEGIN{ split("B KB MB GB",u," "); i=1; while(b>=1024&&i<4){b/=1024;i++} printf "%.2f %s", b, u[i] }'; }
gz_size() { gzip -c "$1" | wc -c | tr -d ' '; }

# A .gltf is a JSON manifest pointing at a .bin and loose texture files, so its own
# size says nothing about what the user actually ships. Sum the manifest plus every
# buffer and image it references, or the "before" figure is meaningless and the saving
# percentage comes out negative.
asset_size() {
  local input="$1"
  local total
  total=$(wc -c < "$input" | tr -d ' ')
  case "$input" in
    *.gltf)
      local dir refs ref
      dir="$(cd "$(dirname "$input")" && pwd)"
      refs=$(python3 - "$input" <<'PY' 2>/dev/null || true
import json, sys, urllib.parse
try:
    doc = json.load(open(sys.argv[1]))
except Exception:
    sys.exit(0)
for key in ("buffers", "images"):
    for item in doc.get(key) or []:
        uri = item.get("uri")
        # Skip data: URIs — already counted inside the manifest itself.
        if uri and not uri.startswith("data:"):
            print(urllib.parse.unquote(uri))
PY
)
      while IFS= read -r ref; do
        [ -n "$ref" ] || continue
        [ -f "$dir/$ref" ] && total=$(( total + $(wc -c < "$dir/$ref" | tr -d ' ') ))
      done <<< "$refs"
      ;;
  esac
  echo "$total"
}

SIZE_BEFORE=$(asset_size "$INPUT")

echo "──────────────────────────────────────────────"
echo " Optimising: $INPUT"
echo " Category:   $CATEGORY (budget $BUDGET_LABEL gzipped)"
echo " Geometry:   $COMPRESSION"
echo " Textures:   KTX2, max ${TEXTURE_SIZE}px"
echo "──────────────────────────────────────────────"

step() { echo "  • $1"; }

# 1. Prune — drop unused nodes, materials, textures, animations
step "prune"
GLTF prune "$INPUT" "$TMP/1.glb" >/dev/null 2>&1

# 2. Dedup — merge duplicate accessors and materials
step "dedup"
GLTF dedup "$TMP/1.glb" "$TMP/2.glb" >/dev/null 2>&1

# 3. Weld — merge coincident vertices (big win on CAD exports)
step "weld"
GLTF weld "$TMP/2.glb" "$TMP/3.glb" >/dev/null 2>&1

# 4. Optional simplification — check normals afterwards, this can wreck curved shading
if [[ -n "$SIMPLIFY" ]]; then
  step "simplify (error $SIMPLIFY)"
  GLTF simplify "$TMP/3.glb" "$TMP/4.glb" --error "$SIMPLIFY" >/dev/null 2>&1
else
  cp "$TMP/3.glb" "$TMP/4.glb"
fi

# 5. Resize textures — usually the single biggest saving
step "resize textures → ${TEXTURE_SIZE}px"
GLTF resize "$TMP/4.glb" "$TMP/5.glb" \
  --width "$TEXTURE_SIZE" --height "$TEXTURE_SIZE" >/dev/null 2>&1

# 6. KTX2 texture compression — stays compressed in VRAM
step "KTX2 texture compression (uastc)"
if ! GLTF uastc "$TMP/5.glb" "$TMP/6.glb" --level 4 --rdo 4 >/dev/null 2>&1; then
  echo "    (uastc failed — falling back to etc1s)"
  GLTF etc1s "$TMP/5.glb" "$TMP/6.glb" --quality 200 >/dev/null 2>&1 \
    || cp "$TMP/5.glb" "$TMP/6.glb"
fi

# 7. Geometry compression
step "$COMPRESSION geometry compression"
if [[ "$COMPRESSION" == "draco" ]]; then
  GLTF draco "$TMP/6.glb" "$OUTPUT" >/dev/null 2>&1
else
  GLTF meshopt "$TMP/6.glb" "$OUTPUT" --level high >/dev/null 2>&1
fi

SIZE_AFTER=$(wc -c < "$OUTPUT" | tr -d ' ')
GZ_AFTER=$(gz_size "$OUTPUT")
if [[ "$SIZE_BEFORE" -gt 0 ]]; then
  SAVED=$(( 100 - (SIZE_AFTER * 100 / SIZE_BEFORE) ))
else
  SAVED=0
fi

echo ""
echo "──────────────────────────────────────────────"
echo " Result"
echo "──────────────────────────────────────────────"
printf "  Before          %s\n" "$(human "$SIZE_BEFORE")"
if [[ "$SAVED" -ge 0 ]]; then
  printf "  After           %s  (-%s%%)\n" "$(human "$SIZE_AFTER")" "$SAVED"
else
  printf "  After           %s  (+%s%% — grew; see note below)\n" "$(human "$SIZE_AFTER")" "$(( -SAVED ))"
fi
printf "  Gzipped         %s\n" "$(human "$GZ_AFTER")"
printf "  Budget          %s\n" "$BUDGET_LABEL"

if [[ "$GZ_AFTER" -le "$BUDGET_BYTES" ]]; then
  printf "  Status          PASS\n"
else
  OVER=$(( GZ_AFTER - BUDGET_BYTES ))
  printf "  Status          FAIL — %s over budget\n" "$(human "$OVER")"
  echo ""
  echo "  Next levers, in order of payoff:"
  echo "    1. --texture-size 1024              (textures are usually 80% of the file)"
  echo "    2. --simplify 0.001                 (then check normals on curved surfaces)"
  echo "    3. Pack occlusion/roughness/metalness into one ORM texture"
  echo "    4. Split the model and lazy-load detail geometry after first paint"
  echo "    5. Drop to etc1s textures if this is a colour map, not a normal map"
fi

echo ""
echo "──────────────────────────────────────────────"
echo " Inspection"
echo "──────────────────────────────────────────────"
GLTF inspect "$OUTPUT" 2>/dev/null | head -50 || true

echo ""
echo "  Triangle budget for $CATEGORY: $TRI_BUDGET"
echo "  Check the triangle count above against it."
echo ""
echo "  Output: $OUTPUT"
echo ""
echo "  Before shipping: load it and confirm materials still read correctly."
echo "  Aggressive simplification can break normals and produce faceted shading."
