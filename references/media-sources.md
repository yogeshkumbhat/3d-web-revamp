# Sourcing media you are allowed to ship

For when the art direction is decided and there is no budget for an artist or a shoot.
This is about *client* work, so the bar is not "free to download" — it is "defensible in
writing if the client's lawyer asks in two years."

## The rule that catches people

**Self-host everything.** A stock site's licence grants you the right to *use* the file.
It does not grant you the right to use their CDN as your delivery network, and none of
these hosts promise the URL will still resolve next quarter. Download it, run it through
`scripts/optimize_video.sh`, serve it from your own origin. This is also the only way to
control the bytes, which is the entire point of the performance budget.

## Sources, ranked by how little you have to think

**CC0 / public domain — safest, no conditions at all**

| Source | What it has | Verified |
|---|---|---|
| [Poly Haven](https://polyhaven.com/license) | HDRIs, textures, models | CC0. "You can use our assets for any purpose, including commercial work", redistribution explicitly allowed, no attribution required |
| [ambientCG](https://ambientcg.com/) | PBR textures, HDRIs | CC0 |
| [Kenney](https://kenney.nl/) | Low-poly model kits, UI | CC0 |

CC0 is a public-domain dedication, so it survives every downstream question: sublicensing,
redistribution inside an MIT repo, a client reselling the site. Start here. `scripts/fetch_fixture.py`
pulls from Poly Haven for exactly this reason.

**Permissive house licences — fine for client sites, with conditions**

| Source | What it has | Verified |
|---|---|---|
| [Pexels](https://www.pexels.com/license/) | Video, photos | "All photos and videos on Pexels are free to use", attribution not required, modification allowed, commercial use allowed |

Pexels' stated prohibitions, which are the ones that actually matter for a client build:
no selling unaltered copies; no redistributing on other stock platforms; no implying
endorsement by people or brands shown; nothing using an identifiable person in a way that
puts them "in a bad light"; and the footage cannot become part of a trade mark, business
name or service mark. Read that last one twice before a clip goes anywhere near a logo
animation or a brand-mark reveal.

**Read the licence yourself — terms vary per clip or per contributor**

Mixkit, Coverr, Videvo, Pixabay, Sketchfab, Blend Swap. Several of these mix licences
within one library: a CC0 item and a CC-BY item and an editorial-only item sit on the same
results page looking identical. Sketchfab in particular requires filtering by licence
before you browse, or you will fall for something you cannot use.

## What to check, on any source

Four clauses decide whether a file is usable on a commercial client site. Check them in
this order, because the first one to fail ends the question:

1. **Commercial use** — permitted outright, or only for "personal/editorial" projects?
2. **Attribution** — required? If yes, where does the credit physically go on the client's
   homepage, and will they accept it? "We'll put it in the footer" is a design decision
   someone has to sign off, not a technicality.
3. **Redistribution / sublicensing** — the client's agency may hand the site to another
   agency later. CC0 survives that. A licence bound to *you* as the downloader may not.
4. **Identifiable people and property** — a model release covers the person; it does not
   cover a recognisable building, artwork or product visible in the frame.

Record the source URL and licence for every file you ship, in the repo, next to the asset.
A `MEDIA.md` with one line per file costs nothing now and is the whole defence later.

## Finding the right clip, not just a nice one

`art-direction.md` makes you write down the emotion, material language, lighting mood and
camera behaviour before any code. Use those four decisions as the search, instead of typing
"3d abstract" and taking whatever is prettiest:

| Direction | Search vocabulary that actually returns it |
|---|---|
| Precision, engineered | `macro metal`, `brushed aluminium`, `caliper`, `cnc`, `blueprint grid` |
| Warmth, craft | `linen texture`, `wood grain macro`, `golden hour interior`, `hands working` |
| Weight, permanence | `stone`, `concrete pour`, `slow dolly architecture`, `monolith` |
| Weightlessness | `ink in water`, `smoke plume`, `silk falling`, `zero gravity`, `particles drift` |
| Clinical, technical | `clean room`, `data centre`, `oscilloscope`, `laboratory glass` |
| Organic, fluid | `fluid simulation`, `iridescent`, `soap film`, `liquid metal`, `caustics` |

For a *hero loop* specifically, filter hard for: slow motion, no cuts, no camera shake, no
people, and something that loops without an obvious seam. Anything with a cut in it will
read as a video player rather than a background, which defeats the purpose.

## What to do with the file

```bash
./scripts/optimize_video.sh clip.mp4 --width 1600 --seconds 6 --budget 2.5
```

It strips audio (a loop with sound cannot autoplay), produces H.264 and VP9, drops the VP9
if it loses to H.264 on that footage, cuts the poster and the reduced-motion still from
frame 0, prints the worst-case download against the budget, and exits non-zero on failure
so it can gate a deploy. It also prints the markup, including the `muted playsinline`
autoplay requirements and the `preload="none"` that keeps the loop off the critical path.

The default budget is 2.5 MB for the whole ladder, which is tight on purpose. `case-studies/pear-no.md`
measures a site shipping 24.4 MB of video; that it still reads as expensive is the
interesting half of the finding, and the cost is the cautionary half.

## When not to use stock at all

Stock footage is a *texture*, not a *subject*. It works behind type, under a gradient, at
low contrast, as atmosphere. The moment it becomes the thing the visitor is looking at, two
problems arrive: it is generic by construction — someone else's site has the same clip —
and it says nothing about what this business actually sells.

If the 3D is the subject, render it. `assets/starter/` already has the procedural studio
rig, three-point lighting and film grain; a loop baked out of it is unique to this project,
tiny, and licence-free by construction. Stock is what you reach for when the media is
background, and the honest answer is often that a still poster and good typography beat a
loop that nobody watches twice.
