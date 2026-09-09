#!/usr/bin/env python3
"""
Audit a live website before a 3D revamp.

Crawls same-origin pages and produces a content inventory: URLs, headings, copy,
CTAs, forms, meta tags, structured data, images, analytics hooks, plus the colour
palette and typefaces in use.

The point is to make it impossible to silently lose content during a redesign.

Usage:
    python audit_site.py https://example.com
    python audit_site.py https://example.com --max-pages 30 --json report.json

Dependencies:
    pip install requests beautifulsoup4
"""

import argparse
import json
import re
import sys
from collections import Counter, OrderedDict
from urllib.parse import urljoin, urlparse, urldefrag

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    sys.exit("Missing dependencies. Run: pip install requests beautifulsoup4")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; site-audit/1.0; +3d-web-revamp skill)"
}

ANALYTICS_SIGNATURES = {
    "Google Analytics 4": r"gtag\(|googletagmanager\.com/gtag",
    "Google Tag Manager": r"googletagmanager\.com/gtm",
    "Meta Pixel": r"connect\.facebook\.net.*fbevents|fbq\(",
    "LinkedIn Insight": r"snap\.licdn\.com",
    "Hotjar": r"static\.hotjar\.com",
    "Clarity": r"clarity\.ms",
    "Plausible": r"plausible\.io",
    "Segment": r"cdn\.segment\.com",
    "HubSpot": r"js\.hs-scripts\.com",
    "Intercom": r"widget\.intercom\.io",
}

HEX_RE = re.compile(r"#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b")
RGB_RE = re.compile(r"rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+")
FONT_FAMILY_RE = re.compile(r"font-family\s*:\s*([^;}\"']+)", re.I)
GOOGLE_FONT_RE = re.compile(r"fonts\.googleapis\.com/css2?\?([^\"']+)")


def norm(url):
    """Strip fragment and trailing slash for dedupe."""
    url, _ = urldefrag(url)
    if url.endswith("/") and len(urlparse(url).path) > 1:
        url = url[:-1]
    return url


def fetch(url, timeout=15):
    try:
        r = requests.get(url, headers=HEADERS, timeout=timeout)
        r.raise_for_status()
        return r
    except Exception as e:
        print(f"  ! {url} — {e}", file=sys.stderr)
        return None


def text_of(el):
    return " ".join(el.get_text(" ", strip=True).split()) if el else ""


def audit_page(url, soup, raw_html):
    """Extract everything worth preserving from one page."""
    page = OrderedDict()
    page["url"] = url

    # --- meta ---
    meta = OrderedDict()
    meta["title"] = text_of(soup.title)
    for name, key in [("description", "description"), ("robots", "robots")]:
        tag = soup.find("meta", attrs={"name": name})
        meta[key] = tag.get("content", "") if tag else ""
    canonical = soup.find("link", rel="canonical")
    meta["canonical"] = canonical.get("href", "") if canonical else ""
    meta["og"] = {
        t.get("property", ""): t.get("content", "")
        for t in soup.find_all("meta", property=re.compile(r"^og:"))
    }
    meta["twitter"] = {
        t.get("name", ""): t.get("content", "")
        for t in soup.find_all("meta", attrs={"name": re.compile(r"^twitter:")})
    }
    page["meta"] = meta

    # --- structured data (rich results depend on this surviving) ---
    page["json_ld"] = []
    for tag in soup.find_all("script", type="application/ld+json"):
        try:
            page["json_ld"].append(json.loads(tag.string or "{}"))
        except Exception:
            page["json_ld"].append({"_unparsed": (tag.string or "")[:400]})

    # --- headings: the information architecture in the client's own words ---
    page["headings"] = [
        {"level": h.name, "text": text_of(h)}
        for h in soup.find_all(["h1", "h2", "h3"])
        if text_of(h)
    ]

    # --- body copy, verbatim ---
    for junk in soup(["script", "style", "noscript", "nav", "footer"]):
        junk.decompose()

    blocks = [text_of(el) for el in soup.find_all(["p", "li", "blockquote", "figcaption"])]
    page["copy"] = [b for b in blocks if len(b) > 30]

    # Fall back to main/article text when the markup isn't paragraph-based.
    if not page["copy"]:
        root = soup.find(["main", "article"]) or soup.body
        if root:
            chunk = text_of(root)
            page["copy"] = [c.strip() for c in re.split(r"(?<=[.!?])\s{1,}", chunk)
                            if len(c.strip()) > 30][:200]

    page["word_count"] = sum(len(p.split()) for p in page["copy"])

    # A near-empty server response means the copy lives in JS — a real revamp risk,
    # because it tells you crawlers are already seeing very little.
    page["likely_client_rendered"] = (
        page["word_count"] < 50 and len(soup.find_all(["div", "section"])) > 20
    )

    # --- conversion paths ---
    ctas = []
    for a in soup.find_all("a", href=True):
        label = text_of(a)
        cls = " ".join(a.get("class", []))
        looks_like_cta = (
            re.search(r"btn|button|cta|primary", cls, re.I)
            or a.get("href", "").startswith(("mailto:", "tel:"))
            or re.search(
                r"\b(book|buy|get|start|contact|demo|quote|call|hire|sign|shop|order)\b",
                label, re.I,
            )
        )
        if label and looks_like_cta:
            ctas.append({"label": label, "href": urljoin(url, a["href"])})
    page["ctas"] = ctas[:40]

    # --- forms: easy to break, expensive to notice ---
    page["forms"] = [
        {
            "action": urljoin(url, f.get("action", "")),
            "method": (f.get("method") or "get").upper(),
            "fields": [
                {
                    "name": i.get("name", ""),
                    "type": i.get("type", i.name),
                    "required": i.has_attr("required"),
                }
                for i in f.find_all(["input", "select", "textarea"])
                if i.get("type") != "hidden"
            ],
        }
        for f in soup.find_all("form")
    ]

    # --- images and alt text (alt text is content) ---
    imgs = soup.find_all("img")
    page["images"] = [
        {"src": urljoin(url, i.get("src", "")), "alt": i.get("alt", "")}
        for i in imgs[:60]
    ]
    page["images_missing_alt"] = sum(1 for i in imgs if not i.get("alt"))

    # --- third-party embeds ---
    page["iframes"] = [
        urljoin(url, f.get("src", "")) for f in soup.find_all("iframe") if f.get("src")
    ]

    # --- analytics ---
    found = [n for n, pat in ANALYTICS_SIGNATURES.items() if re.search(pat, raw_html)]
    page["analytics"] = found

    return page


def extract_style(raw_html, soup, base_url, session_cache):
    """Colours and typefaces, from inline styles and linked stylesheets."""
    css = " ".join(t.string or "" for t in soup.find_all("style"))
    css += " " + " ".join(t.get("style", "") for t in soup.find_all(style=True))

    for link in soup.find_all("link", rel="stylesheet", href=True):
        href = urljoin(base_url, link["href"])
        if urlparse(href).netloc != urlparse(base_url).netloc:
            continue
        if href in session_cache:
            css += " " + session_cache[href]
            continue
        r = fetch(href)
        if r:
            session_cache[href] = r.text
            css += " " + r.text

    colors = Counter(c.lower() for c in HEX_RE.findall(css))
    colors.update(RGB_RE.findall(css))

    fonts = Counter()
    for decl in FONT_FAMILY_RE.findall(css):
        first = decl.split(",")[0].strip().strip("\"'")
        if first and not first.startswith(("var(", "inherit", "initial")):
            fonts[first] += 1

    google = []
    for q in GOOGLE_FONT_RE.findall(raw_html):
        google += re.findall(r"family=([A-Za-z0-9+]+)", q)

    return {
        "palette": [{"value": c, "uses": n} for c, n in colors.most_common(14)],
        "fonts": [{"family": f, "uses": n} for f, n in fonts.most_common(10)],
        "google_fonts": sorted(set(g.replace("+", " ") for g in google)),
    }


def crawl(start_url, max_pages):
    origin = urlparse(start_url).netloc
    queue, seen, pages = [norm(start_url)], set(), []
    style = None
    css_cache = {}

    while queue and len(pages) < max_pages:
        url = queue.pop(0)
        if url in seen:
            continue
        seen.add(url)

        print(f"  → {url}", file=sys.stderr)
        r = fetch(url)
        if not r or "text/html" not in r.headers.get("content-type", ""):
            continue

        raw = r.text
        soup = BeautifulSoup(raw, "html.parser")

        if style is None:
            style = extract_style(raw, BeautifulSoup(raw, "html.parser"), url, css_cache)

        pages.append(audit_page(url, soup, raw))

        for a in soup.find_all("a", href=True):
            link = norm(urljoin(url, a["href"]))
            p = urlparse(link)
            if p.netloc == origin and p.scheme in ("http", "https") and link not in seen:
                if not re.search(r"\.(pdf|zip|jpg|png|svg|webp|mp4|dmg|exe)$", p.path, re.I):
                    queue.append(link)

    return pages, style or {}


def report(pages, style, start_url):
    out = [f"# Site audit — {start_url}", ""]
    out.append(f"**Pages crawled:** {len(pages)}")
    out.append(f"**Total words:** {sum(p['word_count'] for p in pages)}")
    missing_alt = sum(p["images_missing_alt"] for p in pages)
    out.append(f"**Images missing alt text:** {missing_alt}")
    analytics = sorted({a for p in pages for a in p["analytics"]})
    out.append(f"**Analytics detected:** {', '.join(analytics) or 'none'}")
    out.append("")

    out.append("## Brand")
    if style.get("palette"):
        out.append("**Palette (by frequency):** " +
                   "  ".join(f"`{c['value']}`({c['uses']})" for c in style["palette"]))
    if style.get("fonts"):
        out.append("**Fonts:** " + ", ".join(f["family"] for f in style["fonts"]))
    if style.get("google_fonts"):
        out.append("**Google Fonts:** " + ", ".join(style["google_fonts"]))
    out.append("")

    out.append("## Page inventory")
    out.append("")
    out.append("| URL | Title | H1 | Words | CTAs | Forms |")
    out.append("|---|---|---|---|---|---|")
    for p in pages:
        h1 = next((h["text"] for h in p["headings"] if h["level"] == "h1"), "—")
        out.append(
            f"| {p['url']} | {p['meta']['title'][:50]} | {h1[:40]} | "
            f"{p['word_count']} | {len(p['ctas'])} | {len(p['forms'])} |"
        )
    out.append("")

    csr = [p["url"] for p in pages if p.get("likely_client_rendered")]
    if csr:
        out.append("## Warning — little or no content in the server response")
        out.append("")
        out.append("These pages returned almost no text without running JavaScript, which")
        out.append("means crawlers and no-JS users may already be seeing very little. Verify")
        out.append("in Search Console before assuming the copy above is complete, and treat")
        out.append("server rendering as a requirement of the revamp rather than an option.")
        out.append("")
        for u in csr:
            out.append(f"- {u}")
        out.append("")

    out.append("## Must preserve")
    out.append("")
    jsonld = [p["url"] for p in pages if p["json_ld"]]
    out.append(f"- **Structured data on:** {', '.join(jsonld) or 'none found'}")
    forms = [(p["url"], f["action"]) for p in pages for f in p["forms"]]
    if forms:
        out.append("- **Form endpoints:**")
        for u, a in forms:
            out.append(f"  - `{a}` (on {u})")
    embeds = sorted({i for p in pages for i in p["iframes"]})
    if embeds:
        out.append("- **Third-party embeds:**")
        for e in embeds[:20]:
            out.append(f"  - {e}")
    out.append("")

    out.append("## Next steps")
    out.append("")
    out.append("1. Confirm nothing above is being dropped without sign-off")
    out.append("2. Run PageSpeed Insights on the top 3 pages to capture the baseline to beat")
    out.append("3. Pick the category (commerce / brand-service / narrative / portfolio)")
    out.append("4. Write the revamp brief from `references/audit.md`")

    return "\n".join(out)


def main():
    ap = argparse.ArgumentParser(description="Audit a site before a 3D revamp")
    ap.add_argument("url")
    ap.add_argument("--max-pages", type=int, default=25)
    ap.add_argument("--json", help="also write the full structured inventory here")
    args = ap.parse_args()

    url = args.url if args.url.startswith("http") else "https://" + args.url

    print(f"Crawling {url} (max {args.max_pages} pages)...", file=sys.stderr)
    pages, style = crawl(url, args.max_pages)

    if not pages:
        sys.exit("Nothing crawled — check the URL is reachable.")

    print(report(pages, style, url))

    if args.json:
        with open(args.json, "w") as f:
            json.dump({"start_url": url, "style": style, "pages": pages}, f, indent=2)
        print(f"\nFull inventory written to {args.json}", file=sys.stderr)


if __name__ == "__main__":
    main()
