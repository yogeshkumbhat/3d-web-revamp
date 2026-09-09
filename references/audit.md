# Auditing an existing site before a 3D revamp

Goal: rebuild the experience without losing anything that currently earns money, ranks, or
tells the story. Also: decide honestly whether 3D helps this particular site.

## 1. Is 3D actually the right move here?

Answer this before anything else. Run through it with the user and give a straight verdict.

**3D earns its weight when:**
- The product is physical and the buyer has an unanswered spatial question — how big, what
  finish, how does it look in my colour, does it fold, what's inside
- The product is invisible or abstract and needs a memorable physical metaphor (data
  infrastructure, security, logistics networks)
- The brand competes on craft and the site is the proof — studios, agencies, luxury goods,
  architecture, hardware startups
- There's a launch moment worth a set-piece and traffic will be intentional, not incidental

**3D is a bad trade when:**
- The site's job is fast information retrieval (docs, support, listings, local services)
- Traffic is mostly mobile on poor connections in price-sensitive markets
- The real problem is weak copy, no social proof, unclear pricing, or a broken funnel —
  3D papers over none of these and makes the page slower while it fails to
- There's no budget for models and no product to show, so the scene will be an abstract
  blob that says nothing
- Conversion depends on trust signals that reward clarity over spectacle (finance, health,
  legal, B2B enterprise procurement)

If the verdict is "not worth it", say so and name what would actually help. Then, if the
user still wants 3D, propose the smallest version — usually a single hero moment — rather
than quietly building the maximal thing you advised against.

## 2. Content inventory

Run `scripts/audit_site.py <url>`, or read the supplied files. Produce a table covering:

| Field | Why it matters |
|---|---|
| Every URL and its purpose | Pages get silently dropped in redesigns; this is the guard |
| H1 and section headings per page | The information architecture, in the client's own words |
| Body copy, verbatim | Rewriting copy during a visual revamp changes two variables at once |
| CTAs and where they point | These are the conversion paths; they must survive |
| Forms, their fields and endpoints | Easy to break, expensive to notice later |
| Meta title, description, canonical, OG tags | Direct SEO regression risk |
| Structured data / JSON-LD | Rich results vanish if you forget to port these |
| Images and alt text | Alt text is content, not decoration |
| Analytics, pixels, tag manager | Losing these means losing attribution |
| Third-party embeds | Booking widgets, chat, reviews — often business-critical |

Flag anything you plan to drop and get explicit sign-off. Never drop silently.

## 3. Brand extraction

Pull the existing visual system so the revamp reads as an evolution rather than a
different company:

- Colour palette with hex values, and which colour carries the accent role
- Typefaces, weights actually in use, and the type scale
- Corner radii, border treatment, shadow language
- Logo files and clear-space rules
- Photography or illustration style, if any
- Voice: read three paragraphs of their copy and characterise the register

If the existing brand is genuinely weak and the user wants it changed, treat that as a
separate, explicit decision — not something smuggled in with the 3D.

## 4. Baseline measurement

Measure the current site before you replace it, so improvement or regression is provable:

- LCP, CLS, INP from PageSpeed Insights or a lab run, mobile and desktop
- Total transfer size and request count
- Current conversion rate if the user has it

The revamp is only a success if these hold or improve. A prettier site that halves LCP
performance is a downgrade, and without the baseline you'll never be able to say so.

## 5. What to preserve, what to question

**Preserve by default:** URLs (or map redirects 1:1), copy, meta, structured data,
conversion paths, form endpoints, analytics.

**Question openly:** navigation depth, page count, whether five service pages should be
one, image weight, anything scoring badly in the baseline.

## 6. Output of this phase

Write a short brief the user can approve before you build:

```
# Revamp brief: <site>

## Verdict on 3D
<Fit or not, and why. The smallest version that works.>

## Category
<commerce | brand-service | narrative | portfolio> — because <reason>

## Content to preserve
<the inventory table, or a link to it>

## Proposed changes
<what's being dropped, merged or rewritten, each with a reason>

## Baseline to beat
LCP <x>s mobile, <y>s desktop; transfer <z>MB

## Risks
<SEO regressions, embeds that may not survive, model/asset gaps>
```

Approval on this document is what makes the rest of the build safe.
