#!/usr/bin/env python3
"""Write sitemap.xml listing every page of the site.

A page is any index.html under the repository root (the home page, the
symmetry tutorial, each space-group page, the DFT course, and future
tutorials). Template files, asset folders and any folder whose name starts
with "_" (sources, local demos) are skipped. The home page carries a <lastmod>
taken from the last publications update; the DFT course pages carry theirs from
dft/course.json; other pages are listed without one.

Uses only the Python standard library.
"""
from __future__ import annotations

import datetime as dt
import json
from pathlib import Path

BASE = "https://oridwan.github.io/"
ROOT = Path(__file__).resolve().parent.parent
SKIP = {".git", ".github", "assets", "data", "scripts", "node_modules"}


def page_urls() -> list[str]:
    urls = []
    for f in ROOT.rglob("index.html"):
        rel = f.relative_to(ROOT)
        if rel.parts[0] in SKIP or any(p.startswith("_") for p in rel.parts[:-1]):
            continue
        path = "/".join(rel.parts[:-1])
        urls.append(BASE + (path + "/" if path else ""))

    def key(u: str):
        # Home first, then tutorial landing pages, then numbered pages in order.
        parts = u[len(BASE):].strip("/").split("/")
        return (len(parts) if parts != [""] else 0,
                [int(p) if p.isdigit() else p for p in parts])
    return sorted(urls, key=key)


def course_lastmod() -> dict[str, str]:
    """<lastmod> for the DFT course: each published lecture's "modified" date,
    and for the course home the latest of those."""
    f = ROOT / "dft" / "course.json"
    if not f.exists():
        return {}
    course = json.loads(f.read_text())
    out = {}
    for lec in course["lectures"]:
        if lec.get("status") == "published" and lec.get("modified"):
            out[f"{course['base']}{lec['slug']}/"] = lec["modified"]
    home = max(out.values(), default=course.get("published"))
    if home:
        out[course["base"]] = home
    return out


def main() -> None:
    data = ROOT / "data" / "publications.json"
    updated = None
    if data.exists():
        updated = json.loads(data.read_text()).get("metrics", {}).get("updated")
    updated = updated or dt.date.today().isoformat()
    lastmod = {BASE: updated, **course_lastmod()}

    lines = ['<?xml version="1.0" encoding="UTF-8"?>',
             '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    urls = page_urls()
    for url in urls:
        lines.append("  <url>")
        lines.append(f"    <loc>{url}</loc>")
        if url in lastmod:
            lines.append(f"    <lastmod>{lastmod[url]}</lastmod>")
        lines.append("  </url>")
    lines.append("</urlset>")
    (ROOT / "sitemap.xml").write_text("\n".join(lines) + "\n")
    print(f"Wrote {len(urls)} URLs to sitemap.xml")


if __name__ == "__main__":
    main()
