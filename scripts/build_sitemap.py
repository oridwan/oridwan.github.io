#!/usr/bin/env python3
"""Write sitemap.xml listing every page of the site.

A page is any index.html under the repository root (the home page, the
symmetry tutorial, each space-group page, and future tutorials). Template
files and asset folders are skipped. The home page carries a <lastmod> taken
from the last publications update; other pages are listed without one.

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
        if rel.parts[0] in SKIP:
            continue
        path = "/".join(rel.parts[:-1])
        urls.append(BASE + (path + "/" if path else ""))

    def key(u: str):
        # Home first, then tutorial landing pages, then numbered pages in order.
        parts = u[len(BASE):].strip("/").split("/")
        return (len(parts) if parts != [""] else 0,
                [int(p) if p.isdigit() else p for p in parts])
    return sorted(urls, key=key)


def main() -> None:
    data = ROOT / "data" / "publications.json"
    updated = None
    if data.exists():
        updated = json.loads(data.read_text()).get("metrics", {}).get("updated")
    updated = updated or dt.date.today().isoformat()

    lines = ['<?xml version="1.0" encoding="UTF-8"?>',
             '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    urls = page_urls()
    for url in urls:
        lines.append("  <url>")
        lines.append(f"    <loc>{url}</loc>")
        if url == BASE:
            lines.append(f"    <lastmod>{updated}</lastmod>")
        lines.append("  </url>")
    lines.append("</urlset>")
    (ROOT / "sitemap.xml").write_text("\n".join(lines) + "\n")
    print(f"Wrote {len(urls)} URLs to sitemap.xml")


if __name__ == "__main__":
    main()
