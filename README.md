# oridwan.github.io

Personal academic website of Osman Goni Ridwan — static HTML/CSS/JS served by GitHub Pages.

| File | Purpose |
| --- | --- |
| `index.html` | Page content. The publication list, Scholar stats and publication JSON-LD are **generated** — edit between the `BEGIN`/`END` markers only via the script. |
| `style.css`, `main.js` | Styling and interactions (scrollspy, reveal, publication filter/sort/search). |
| `assets/OGR.pdf` | CV linked from the site. Replace this file to update the CV. |
| `data/publications.json` | Generated cache of Scholar + Crossref/arXiv metadata. |
| `data/pub_overrides.json` | Hand-curated extras per paper: code links, arXiv IDs, highlight text, `hidden`. |

## Publications sync

`scripts/update_publications.py` (stdlib only) scrapes the Google Scholar profile, enriches each entry
via Crossref (DOI, full author list) or the arXiv API, merges `data/pub_overrides.json`, and rewrites the
publication section of `index.html`.

- Runs weekly via `.github/workflows/update-publications.yml`, and on demand from the Actions tab
  ("Run workflow").
- Run locally: `python3 scripts/update_publications.py`
- If Scholar blocks the request (it sometimes blocks CI IPs), the script keeps the cached data and
  the job still succeeds; run it locally to refresh.
- To add a code link or highlight to a paper, find its Scholar ID in `data/publications.json` (`id`)
  and add an entry in `data/pub_overrides.json`.

## Space-group pages (`symmetry/`)

An interactive guide to crystallographic symmetry (`symmetry/index.html`) plus one page per space group
(`symmetry/<n>/index.html`, n = 1–230).

| File | Purpose |
| --- | --- |
| `symmetry/sg-core.js` | Symmetry engine: parses operations such as `-x,y+1/2,-z+1/2` and derives each one's axis / plane / centre and screw or glide part. No DOM; runs under Node. |
| `symmetry/sg-view.js` | Shared three.js viewer (cell, handedness motif, symmetry elements, animated operations). |
| `symmetry/group.js`, `group-template.html` | The space-group page. |
| `symmetry/guide.js` | Figures and the group browser on the guide page. |
| `symmetry/<n>/index.html`, `symmetry/data/index.js` | **Generated** — do not edit by hand. |

Regenerate after changing the template or the data: `python3 scripts/build_symmetry.py` (needs `pyxtal` and
`spglib`). Settings follow the International Tables / Bilbao defaults: unique axis b, origin choice 2,
hexagonal axes for R groups.
