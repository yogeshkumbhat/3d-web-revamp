#!/usr/bin/env bash
#
# Video hero encode ladder with budget reporting.
#
# Takes a stock or rendered clip and produces everything a video hero needs to ship:
# an H.264 mp4, a VP9 webm, a poster in AVIF/WebP/JPEG, and the still frame that
# prefers-reduced-motion users get instead of the loop. Audio is stripped — a hero
# loop that carries sound cannot autoplay, and nobody wants it to.
#
# Usage:
#   ./optimize_video.sh clip.mp4
#   ./optimize_video.sh clip.mov --width 1920 --seconds 8 --budget 2.5
#   ./optimize_video.sh clip.mp4 --fps 24 --outdir dist/media
#
# Defaults: 1600px wide, 6s, 30fps, 2.5 MB budget for the whole ladder.
#
# The budget is deliberately tight. pear.no ships 24.4 MB of video and that is the
# cautionary half of the case study, not the lesson. A hero loop is decoration; if it
# costs more than the content it decorates, cut it.
#
# Requires: ffmpeg (with libx264 and libvpx-vp9). AVIF/WebP posters need an ffmpeg
# built with libaom/libwebp; the script skips formats your build cannot produce.

set -euo pipefail

INPUT=""
WIDTH=1600
SECONDS_LIMIT=6
FPS=30
BUDGET_MB=2.5
OUTDIR="./media"

usage() { sed -n '2,22p' "$0" | sed 's/^# \?//'; exit 1; }

while [[ $# -gt 0 ]]; do
  case $1 in
    --width)   WIDTH="$2"; shift 2 ;;
    --seconds) SECONDS_LIMIT="$2"; shift 2 ;;
    --fps)     FPS="$2"; shift 2 ;;
    --budget)  BUDGET_MB="$2"; shift 2 ;;
    --outdir)  OUTDIR="$2"; shift 2 ;;
    -h|--help) usage ;;
    *)         INPUT="$1"; shift ;;
  esac
done

[[ -z "$INPUT" ]] && usage
[[ -f "$INPUT" ]] || { echo "No such file: $INPUT" >&2; exit 1; }

command -v ffmpeg >/dev/null 2>&1 || { echo "ffmpeg not found. brew install ffmpeg" >&2; exit 1; }

BASE="$(basename "${INPUT%.*}")"
mkdir -p "$OUTDIR"

human() { awk -v b="$1" 'BEGIN{ split("B KB MB GB",u," "); i=1; while(b>=1024&&i<4){b/=1024;i++} printf "%.2f %s", b, u[i] }'; }
bytes() { wc -c < "$1" | tr -d ' '; }
has_encoder() { ffmpeg -hide_banner -encoders 2>/dev/null | grep -q " $1 "; }

SIZE_BEFORE=$(bytes "$INPUT")
# Even dimensions or H.264 refuses the frame size.
SCALE="scale=${WIDTH}:-2:flags=lanczos"

echo "──────────────────────────────────────────────"
echo " Encoding:  $INPUT"
echo " Target:    ${WIDTH}px, ${SECONDS_LIMIT}s, ${FPS}fps, no audio"
echo " Budget:    ${BUDGET_MB} MB for the full ladder"
echo "──────────────────────────────────────────────"

echo "  • H.264 mp4 (universal, faststart)"
ffmpeg -y -hide_banner -loglevel error -i "$INPUT" -t "$SECONDS_LIMIT" \
  -an -vf "$SCALE,fps=${FPS}" \
  -c:v libx264 -profile:v main -pix_fmt yuv420p -crf 28 -preset slow \
  -movflags +faststart "$OUTDIR/${BASE}.mp4"

echo "  • VP9 webm (kept only if it actually wins)"
ffmpeg -y -hide_banner -loglevel error -i "$INPUT" -t "$SECONDS_LIMIT" \
  -an -vf "$SCALE,fps=${FPS}" \
  -c:v libvpx-vp9 -crf 42 -b:v 0 -row-mt 1 -deadline good -cpu-used 2 \
  "$OUTDIR/${BASE}.webm"

# VP9 usually beats H.264, but on high-detail or noisy footage it loses badly. The
# browser takes the first <source> it can decode, so a webm that is larger than the
# mp4 means Chrome and Firefox download the worse file. Never ship that: if webm
# does not win, delete it and let everyone take the mp4.
WEBM_KEPT=1
if [[ $(bytes "$OUTDIR/${BASE}.webm") -ge $(bytes "$OUTDIR/${BASE}.mp4") ]]; then
  echo "    (webm came out larger than the mp4 — dropped, mp4 serves everyone)"
  rm -f "$OUTDIR/${BASE}.webm"
  WEBM_KEPT=0
fi

# The poster is the LCP element and the no-JS/no-autoplay fallback, so it is taken
# from the first frame the viewer would actually see, not a random keyframe.
echo "  • poster + reduced-motion still (frame 0)"
ffmpeg -y -hide_banner -loglevel error -i "$INPUT" -frames:v 1 \
  -vf "$SCALE" -q:v 4 "$OUTDIR/${BASE}-poster.jpg"
cp "$OUTDIR/${BASE}-poster.jpg" "$OUTDIR/${BASE}-still.jpg"

for fmt in webp avif; do
  enc="libwebp"; [[ "$fmt" == "avif" ]] && enc="libaom-av1"
  if has_encoder "$enc"; then
    ffmpeg -y -hide_banner -loglevel error -i "$INPUT" -frames:v 1 \
      -vf "$SCALE" "$OUTDIR/${BASE}-poster.${fmt}" 2>/dev/null \
      && echo "  • poster.${fmt}" \
      || echo "    (${fmt} poster failed — skipped)"
  else
    echo "    (no $enc in this ffmpeg — skipping ${fmt} poster)"
  fi
done

echo ""
echo "──────────────────────────────────────────────"
echo " Result"
echo "──────────────────────────────────────────────"
printf "  Source          %s\n" "$(human "$SIZE_BEFORE")"

# What a visitor downloads is one video plus one poster, not the whole directory:
# the browser picks a single <source> and a single poster format.
MP4=$(bytes "$OUTDIR/${BASE}.mp4")
POSTER=$(bytes "$OUTDIR/${BASE}-poster.jpg")
BIGGEST_VIDEO=$MP4

printf "  mp4 (h264)      %s\n" "$(human "$MP4")"
if [[ "$WEBM_KEPT" -eq 1 ]]; then
  WEBM=$(bytes "$OUTDIR/${BASE}.webm")
  printf "  webm (vp9)      %s  (-%s%% vs mp4)\n" "$(human "$WEBM")" "$(( 100 - (WEBM * 100 / MP4) ))"
  [[ "$WEBM" -gt "$BIGGEST_VIDEO" ]] && BIGGEST_VIDEO=$WEBM
else
  printf "  webm (vp9)      dropped — lost to h264 on this footage\n"
fi
printf "  poster (jpg)    %s\n" "$(human "$POSTER")"
printf "  Worst-case load %s  (largest video a browser might pick + poster)\n" "$(human "$(( BIGGEST_VIDEO + POSTER ))")"

BUDGET_BYTES=$(awk -v m="$BUDGET_MB" 'BEGIN{ printf "%d", m * 1048576 }')
WORST=$(( BIGGEST_VIDEO + POSTER ))
printf "  Budget          %s\n" "$(human "$BUDGET_BYTES")"

if [[ "$WORST" -le "$BUDGET_BYTES" ]]; then
  printf "  Status          PASS\n"
  STATUS=0
else
  printf "  Status          FAIL — %s over budget\n" "$(human "$(( WORST - BUDGET_BYTES ))")"
  echo ""
  echo "  Cheapest wins, in order:"
  echo "    1. --seconds 4                  (length is linear in bytes)"
  echo "    2. --width 1280                 (a hero loop is behind type; it can be soft)"
  echo "    3. --fps 24                     (fine for slow abstract motion)"
  echo "    4. Ask whether it earns its bytes at all — the poster alone may be enough."
  STATUS=1
fi

WEBM_SOURCE=""
[[ "$WEBM_KEPT" -eq 1 ]] && WEBM_SOURCE="
    <source src=\"${BASE}.webm\" type=\"video/webm\">"

cat <<MARKUP

──────────────────────────────────────────────
 Markup
──────────────────────────────────────────────
  <video class="hero-media" autoplay muted loop playsinline preload="none"
         poster="${BASE}-poster.jpg" aria-hidden="true">${WEBM_SOURCE}
    <source src="${BASE}.mp4"  type="video/mp4">
  </video>

  @media (prefers-reduced-motion: reduce) {
    .hero-media { display: none; }
    .hero-still { display: block; }   /* ${BASE}-still.jpg */
  }

  autoplay needs muted + playsinline or iOS refuses it. preload="none" keeps the
  loop off the critical path — the poster is the LCP element, not the video.
MARKUP

exit $STATUS
