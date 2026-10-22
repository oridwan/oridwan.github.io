#!/usr/bin/env python3
"""Sync publications from Google Scholar into the website.

Pipeline:
  1. Scrape the public Google Scholar profile (titles, venues, citations, h-index,
     citations-per-year).
  2. Enrich each entry with full metadata from Crossref (DOI, full author list,
     publication date) or the arXiv API (for preprints). Enrichment is cached in
     data/publications.json so each paper is only looked up once.
  3. Apply manual overrides from data/pub_overrides.json (code links, arXiv
     links, highlights, featured flag).
  4. Write data/publications.json and regenerate the static publication list,
     stats and JSON-LD inside index.html (between BEGIN/END markers), so the
     page is fully crawlable without JavaScript.

If Google Scholar blocks the request (common from CI IP ranges), the script
falls back to the cached data and still regenerates the page, exiting 0.

Uses only the Python standard library.
"""
from __future__ import annotations

import datetime as dt
import html
import json
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

SCHOLAR_ID = "-NaiqfUAAAAJ"
OWNER_SURNAME = "ridwan"
OWNER_DISPLAY = "O. G. Ridwan"

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "publications.json"
OVERRIDES = ROOT / "data" / "pub_overrides.json"
INDEX = ROOT / "index.html"

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")
API_UA = "oridwan.github.io publication sync (https://oridwan.github.io)"

MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
          "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


# --------------------------------------------------------------------------- #
# HTTP
# --------------------------------------------------------------------------- #
def fetch(url: str, ua: str = API_UA, retries: int = 3) -> str:
    last = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": ua,
                                                       "Accept-Language": "en"})
            with urllib.request.urlopen(req, timeout=30) as r:
                body = r.read().decode("utf-8", "replace")
            if "Rate exceeded" in body[:200]:
                raise RuntimeError("rate limited")
            return body
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(3 * (attempt + 1))
    raise RuntimeError(f"GET {url} failed: {last}")


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


def strip_tags(s: str) -> str:
    return html.unescape(re.sub(r"<[^>]+>", "", s)).strip()


# --------------------------------------------------------------------------- #
# Google Scholar
# --------------------------------------------------------------------------- #
def scrape_scholar() -> dict:
    url = (f"https://scholar.google.com/citations?user={SCHOLAR_ID}"
           "&hl=en&cstart=0&pagesize=100&sortby=pubdate")
    page = fetch(url, ua=UA)
    if "gsc_a_tr" not in page:
        raise RuntimeError("no publication rows (blocked or CAPTCHA)")

    pubs = []
    for row in re.findall(r'<tr class="gsc_a_tr">(.*?)</tr>', page, re.S):
        title = re.search(r'class="gsc_a_at"[^>]*>(.*?)</a>', row, re.S)
        cid = re.search(r"citation_for_view=[^:\"&]+:([\w-]+)", row)
        grays = [strip_tags(g) for g in
                 re.findall(r'<div class="gs_gray">(.*?)</div>', row, re.S)]
        cites = re.search(r'class="gsc_a_ac[^"]*"[^>]*>(\d*)</a>', row)
        year = re.search(r'class="gsc_a_h gsc_a_hc gs_ibl">(\d{4})<', row)
        if not (title and cid):
            continue
        pubs.append({
            "scholar_id": cid.group(1),
            "scholar_title": strip_tags(title.group(1)),
            "scholar_authors": grays[0] if grays else "",
            "scholar_venue": grays[1] if len(grays) > 1 else "",
            "citations": int(cites.group(1)) if cites and cites.group(1) else 0,
            "year": int(year.group(1)) if year else None,
        })

    stats = [int(x) for x in re.findall(r'class="gsc_rsb_std">(\d+)<', page)]
    years = {m.group(2): m.group(1) for m in re.finditer(
        r'class="gsc_g_t" style="right:(\d+)px">(\d{4})<', page)}
    by_right = {int(r): int(y) for y, r in years.items()}
    per_year = {y: 0 for y in sorted(by_right.values())}
    for m in re.finditer(r'class="gsc_g_a" style="right:(\d+)px[^"]*">'
                         r'<span class="gsc_g_al">(\d+)<', page):
        y = by_right.get(int(m.group(1)) - 5)
        if y:
            per_year[y] = int(m.group(2))

    return {
        "publications": pubs,
        "metrics": {
            "citations": stats[0] if stats else 0,
            "h_index": stats[2] if len(stats) > 2 else 0,
            "i10_index": stats[4] if len(stats) > 4 else 0,
            "citations_per_year": {str(k): v for k, v in per_year.items()},
        },
    }


# --------------------------------------------------------------------------- #
# Enrichment
# --------------------------------------------------------------------------- #
def crossref_lookup(title: str) -> dict | None:
    q = urllib.parse.quote(title)
    url = (f"https://api.crossref.org/works?query.bibliographic={q}&rows=5"
           "&select=DOI,title,container-title,short-container-title,volume,"
           "issue,article-number,page,published,author,type")
    items = json.loads(fetch(url))["message"]["items"]
    for it in items:
        if norm((it.get("title") or [""])[0]) != norm(title):
            continue
        parts = (it.get("published") or {}).get("date-parts", [[None]])[0]
        authors = [f"{a.get('given', '')} {a.get('family', '')}".strip()
                   for a in it.get("author", [])]
        return {
            "doi": it["DOI"],
            "journal": (it.get("container-title") or [""])[0],
            "volume": it.get("volume"),
            "issue": it.get("issue"),
            "article": it.get("article-number") or it.get("page"),
            "date": "-".join(f"{p:02d}" if i else str(p)
                             for i, p in enumerate(parts) if p),
            "authors": authors,
        }
    return None


def arxiv_lookup(arxiv_id: str) -> dict | None:
    xml = fetch(f"https://export.arxiv.org/api/query?id_list={arxiv_id}")
    ns = {"a": "http://www.w3.org/2005/Atom"}
    entry = ET.fromstring(xml).find("a:entry", ns)
    if entry is None or entry.find("a:title", ns) is None:
        return None
    return {
        "arxiv": arxiv_id,
        "authors": [a.findtext("a:name", "", ns)
                    for a in entry.findall("a:author", ns)],
        "date": entry.findtext("a:published", "", ns)[:10],
    }


def short_name(full: str) -> str:
    """'Osman Goni Ridwan' -> 'O. G. Ridwan'; keeps already-short names."""
    full = re.sub(r"\s+", " ", full).strip()
    if "," in full:
        last, first = [p.strip() for p in full.split(",", 1)]
    else:
        bits = full.split(" ")
        if len(bits) == 1:
            return full
        first, last = " ".join(bits[:-1]), bits[-1]
    initials = []
    for tok in re.split(r"[\s]+", first):
        sub = [s for s in tok.split("-") if s]
        initials.append("-".join(s[0].upper() + "." for s in sub))
    return " ".join(initials + [last])


def classify(venue: str) -> str:
    v = venue.lower()
    if re.search(r"arxiv|chemrxiv|biorxiv|preprint|ssrn", v):
        return "preprint"
    if re.search(r"proceedings|conference|symposium|workshop", v):
        return "conference"
    return "journal"


def enrich(pub: dict, cache: dict) -> dict:
    sid = pub["scholar_id"]
    cached = cache.get(sid, {})
    # Re-query only when the venue changed (e.g. a preprint got published).
    if cached.get("_enriched_for") == pub["scholar_venue"]:
        return {k: v for k, v in cached.items() if k in ENRICH_KEYS}

    meta: dict = {}
    venue = pub["scholar_venue"]
    m = re.search(r"arXiv:(\d{4}\.\d{4,5})", venue)
    try:
        if m:
            meta = arxiv_lookup(m.group(1)) or {}
            time.sleep(3)
        else:
            meta = crossref_lookup(pub["scholar_title"]) or {}
            time.sleep(1)
    except Exception as e:  # noqa: BLE001
        print(f"  ! enrichment failed for '{pub['scholar_title'][:50]}': {e}")
        return {k: v for k, v in cached.items() if k in ENRICH_KEYS}
    meta["_enriched_for"] = venue
    return meta


ENRICH_KEYS = {"doi", "journal", "volume", "issue", "article", "date",
               "authors", "arxiv", "_enriched_for"}


# --------------------------------------------------------------------------- #
# Build
# --------------------------------------------------------------------------- #
def build_record(pub: dict, meta: dict, ov: dict) -> dict:
    venue_raw = pub["scholar_venue"]
    kind = ov.get("type") or classify(venue_raw)

    if meta.get("authors"):
        authors = [short_name(a) for a in meta["authors"]]
    else:
        authors = [a.strip() for a in pub["scholar_authors"].split(",")
                   if a.strip() and a.strip() != "..."]
        authors = [re.sub(r"^([A-Z]+) ", lambda m: " ".join(c + "." for c in
                                                            m.group(1)) + " ",
                          a) for a in authors]
    authors = ov.get("authors", authors)

    if kind == "journal" and meta.get("journal"):
        venue = meta["journal"]
        detail = ", ".join(x for x in [meta.get("volume"), meta.get("article")]
                           if x)
    elif kind == "preprint" and meta.get("arxiv"):
        venue, detail = "arXiv", meta["arxiv"]
    else:
        venue = re.sub(r",\s*\d{4}$", "", venue_raw).replace("\xa0…", "…")
        detail = ""
    venue = ov.get("venue", venue)

    date = ov.get("date") or meta.get("date") or str(pub["year"] or "")
    year = int(date[:4]) if date[:4].isdigit() else pub["year"]

    links = []
    doi = ov.get("doi") or meta.get("doi")
    if doi:
        links.append({"label": "Paper", "url": f"https://doi.org/{doi}"})
    arxiv = ov.get("arxiv") or meta.get("arxiv")
    if arxiv:
        links.append({"label": "arXiv", "url": f"https://arxiv.org/abs/{arxiv}"})
    for extra in ov.get("links", []):
        links.append(extra)
    links.append({"label": "Scholar", "url":
                  "https://scholar.google.com/citations?view_op=view_citation"
                  f"&hl=en&user={SCHOLAR_ID}&citation_for_view="
                  f"{SCHOLAR_ID}:{pub['scholar_id']}"})

    first = bool(authors) and OWNER_SURNAME in authors[0].lower()
    title = ov.get("title") or pub["scholar_title"]
    if title.isupper():
        title = title.title()

    return {
        "id": pub["scholar_id"],
        "title": title,
        "authors": authors,
        "first_author": first,
        "venue": venue,
        "detail": detail,
        "type": kind,
        "date": date,
        "year": year,
        "citations": pub["citations"],
        "doi": doi,
        "links": links,
        "highlight": ov.get("highlight"),
        "featured": bool(ov.get("featured")),
    }


def esc(s) -> str:
    return html.escape(str(s), quote=True)


def render_authors(authors: list[str]) -> str:
    out = []
    for a in authors:
        if OWNER_SURNAME in a.lower():
            out.append(f'<span class="me">{esc(a)}</span>')
        else:
            out.append(esc(a))
    if len(out) > 8:
        me = next((i for i, a in enumerate(authors)
                   if OWNER_SURNAME in a.lower()), 0)
        keep = sorted(set(range(3)) | {me} | {len(out) - 1})
        trimmed = []
        for i in keep:
            if trimmed and i != prev + 1:
                trimmed.append("…")
            trimmed.append(out[i])
            prev = i
        out = trimmed
    return ", ".join(out)


TYPE_LABEL = {"journal": "Journal", "preprint": "Preprint",
              "conference": "Conference"}


def render_pub(p: dict) -> str:
    links = "".join(
        f'<a href="{esc(l["url"])}" target="_blank" rel="noopener">'
        f'{esc(l["label"])}</a>' for l in p["links"])
    cites = (f'<span class="pub-cites" title="Citations (Google Scholar)">'
             f'{p["citations"]} citation{"s" if p["citations"] != 1 else ""}'
             f'</span>' if p["citations"] else "")
    first = ('<span class="tag tag-first">First author</span>'
             if p["first_author"] else "")
    hl = (f'<p class="pub-highlight">{esc(p["highlight"])}</p>'
          if p.get("highlight") else "")
    venue = f'<em>{esc(p["venue"])}</em>'
    if p["detail"]:
        venue += f' {esc(p["detail"])}'
    return f"""      <li class="pub reveal" data-type="{p['type']}" data-year="{p['year']}" data-date="{esc(p['date'])}" data-cites="{p['citations']}" data-first="{str(p['first_author']).lower()}">
        <div class="pub-year">{p['year']}</div>
        <div class="pub-body">
          <h3 class="pub-title">{esc(p['title'])}</h3>
          <p class="pub-authors">{render_authors(p['authors'])}</p>
          <p class="pub-venue">{venue}</p>
          {hl}
          <div class="pub-meta">
            <span class="tag tag-{p['type']}">{TYPE_LABEL[p['type']]}</span>{first}{cites}
            <span class="pub-links">{links}</span>
          </div>
        </div>
      </li>"""


def render_jsonld(pubs: list[dict]) -> str:
    graph = []
    for p in pubs:
        item = {
            "@type": "ScholarlyArticle",
            "name": p["title"],
            "author": [{"@type": "Person", "name": a} for a in p["authors"]],
            "datePublished": p["date"],
            "url": p["links"][0]["url"],
        }
        if p["type"] != "preprint":
            item["isPartOf"] = {"@type": "Periodical", "name": p["venue"]}
        if p["doi"]:
            item["identifier"] = f"https://doi.org/{p['doi']}"
        graph.append(item)
    body = json.dumps({"@context": "https://schema.org", "@graph": graph},
                      ensure_ascii=False, indent=2)
    return f'<script type="application/ld+json">\n{body}\n</script>'


def replace_block(text: str, name: str, content: str) -> str:
    pat = re.compile(rf"(<!-- BEGIN:{name} -->)(.*?)(\s*<!-- END:{name} -->)",
                     re.S)
    if not pat.search(text):
        raise SystemExit(f"marker BEGIN:{name} not found in index.html")
    return pat.sub(lambda m: f"{m.group(1)}\n{content}{m.group(3)}", text)


def main() -> int:
    cache_doc = json.loads(DATA.read_text()) if DATA.exists() else {}
    cache = {p["id"]: p.get("_meta", {})
             for p in cache_doc.get("publications", [])}
    overrides = json.loads(OVERRIDES.read_text()) if OVERRIDES.exists() else {}

    try:
        print("Fetching Google Scholar profile…")
        scholar = scrape_scholar()
        print(f"  {len(scholar['publications'])} publications, "
              f"{scholar['metrics']['citations']} citations")
        fresh = True
    except Exception as e:  # noqa: BLE001
        if not cache_doc:
            print(f"Scholar fetch failed and no cache exists: {e}")
            return 1
        print(f"::warning::Scholar fetch failed ({e}); using cached data")
        scholar = {"publications": [p["_scholar"] for p in
                                    cache_doc["publications"]],
                   "metrics": cache_doc["metrics"]}
        fresh = False

    pubs = []
    for sp in scholar["publications"]:
        ov = overrides.get(sp["scholar_id"], {})
        if ov.get("hidden"):
            continue
        meta = enrich(sp, cache)
        rec = build_record(sp, meta, ov)
        rec["_scholar"] = sp
        rec["_meta"] = meta
        pubs.append(rec)

    pubs.sort(key=lambda p: (p["date"], p["citations"]), reverse=True)

    metrics = dict(scholar["metrics"])
    metrics["publications"] = len(pubs)
    metrics["first_author"] = sum(p["first_author"] for p in pubs)
    # Only bump the "last updated" date when something actually changed, so
    # scheduled runs don't produce empty commits.
    old_metrics = dict(cache_doc.get("metrics", {}))
    old_updated = old_metrics.pop("updated", None)
    changed = (metrics != old_metrics or
               [{k: v for k, v in p.items() if k != "_meta"} for p in pubs] !=
               [{k: v for k, v in p.items() if k != "_meta"}
                for p in cache_doc.get("publications", [])])
    metrics["updated"] = (dt.date.today().isoformat() if fresh and changed
                          else old_updated or dt.date.today().isoformat())

    DATA.parent.mkdir(exist_ok=True)
    DATA.write_text(json.dumps({"metrics": metrics, "publications": pubs},
                               ensure_ascii=False, indent=2) + "\n")

    public = [{k: v for k, v in p.items() if not k.startswith("_")}
              for p in pubs]
    text = INDEX.read_text()
    text = replace_block(text, "PUBLICATIONS",
                         "\n".join(render_pub(p) for p in public))
    text = replace_block(text, "PUBS-JSONLD", render_jsonld(public))
    stats = {
        "citations": metrics["citations"],
        "h_index": metrics["h_index"],
        "publications": metrics["publications"],
        "journal": sum(p["type"] == "journal" for p in public),
        "preprint": sum(p["type"] == "preprint" for p in public),
        "first_author_journal": sum(p["type"] == "journal" and p["first_author"]
                                    for p in public),
    }
    for key, val in stats.items():
        text = re.sub(rf'(data-stat="{key}"[^>]*>)[^<]*(<)', rf"\g<1>{val}\2",
                      text)
    upd = metrics.get("updated") or ""
    if upd:
        d = dt.date.fromisoformat(upd)
        text = re.sub(r'(data-stat="updated"[^>]*>)[^<]*(<)',
                      rf"\g<1>{MONTHS[d.month - 1]} {d.year}\2", text)
    INDEX.write_text(text)
    print(f"Wrote {len(pubs)} publications to index.html")
    return 0


if __name__ == "__main__":
    sys.exit(main())
