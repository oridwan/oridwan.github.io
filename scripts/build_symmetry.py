#!/usr/bin/env python3
"""Build the space-group pages under symmetry/.

For each of the 230 space groups (standard setting, as in the International
Tables Vol. A and the Bilbao get_wp listing: unique axis b / cell choice 1,
origin choice 2, hexagonal axes for R groups) this writes

  symmetry/<n>/index.html   the group page: symmetry/group-template.html filled
                            with static, crawlable HTML (title, summary, tables,
                            related links, structured data) plus the group data
                            embedded as JSON for the interactive viewer
  symmetry/data/index.js    a summary of all groups, used by the guide page
  symmetry/index.html       the group list between the BEGIN/END groups markers

Needs pyxtal and spglib:  pip install pyxtal spglib
Run:                      python3 scripts/build_symmetry.py
"""
from __future__ import annotations

import html
import json
import re
from pathlib import Path

import spglib
from pyxtal.symmetry import Group

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "symmetry"
TEMPLATE = OUT / "group-template.html"
GUIDE = OUT / "index.html"
BASE = "https://oridwan.github.io/symmetry/"
IMAGE = "https://oridwan.github.io/assets/fig/learn-symmetry.webp"
AUTHOR = {"@type": "Person", "name": "Osman Goni Ridwan", "url": "https://oridwan.github.io/"}
SYSTEMS = ["triclinic", "monoclinic", "orthorhombic", "tetragonal", "trigonal", "hexagonal", "cubic"]

# Well-known materials and structure types, shown on the group page and in the browser.
EXAMPLES = {
    2: "many molecular crystals; kyanite Al₂SiO₅",
    4: "chiral molecular crystals, e.g. sucrose",
    12: "orthoclase KAlSi₃O₈",
    14: "about a third of all organic molecular crystals; baddeleyite ZrO₂",
    15: "many molecular crystals; diopside CaMgSi₂O₆; muscovite mica",
    19: "most common group for chiral molecules and proteins",
    33: "potassium titanyl phosphate (KTP) KTiOPO₄",
    38: "orthorhombic BaTiO₃",
    61: "many organic crystals; brookite TiO₂",
    62: "olivine (Mg,Fe)₂SiO₄; aragonite CaCO₃; GdFeO₃-type perovskites",
    63: "α-uranium",
    64: "black phosphorus; α-gallium",
    70: "α-sulfur",
    99: "tetragonal BaTiO₃ and PbTiO₃",
    123: "L1₀ alloys CuAu, FePt",
    136: "rutile TiO₂; stishovite SiO₂",
    139: "ThCr₂Si₂-type compounds; K₂NiF₄-type La₂CuO₄",
    140: "low-temperature tetragonal SrTiO₃",
    141: "anatase TiO₂; zircon ZrSiO₄",
    148: "ilmenite FeTiO₃; dolomite CaMg(CO₃)₂",
    152: "α-quartz SiO₂ (one enantiomorph)",
    154: "α-quartz SiO₂ (the other enantiomorph)",
    161: "lithium niobate LiNbO₃, LiTaO₃",
    164: "brucite Mg(OH)₂; CdI₂-type compounds",
    166: "Bi₂Te₃, Bi₂Se₃; LiCoO₂; bismuth and antimony",
    167: "corundum Al₂O₃; hematite Fe₂O₃; calcite CaCO₃",
    176: "apatite Ca₅(PO₄)₃(F,Cl,OH)",
    186: "wurtzite ZnO, GaN, ZnS",
    187: "tungsten carbide WC",
    191: "AlB₂-type compounds such as MgB₂; CaCu₅",
    194: "graphite; hexagonal BN; NiAs; 2H-MoS₂; hcp metals Mg, Ti, Zn",
    198: "B20 compounds FeSi, MnSi; NaClO₃",
    205: "pyrite FeS₂",
    206: "bixbyite Mn₂O₃; In₂O₃",
    213: "β-manganese",
    216: "zinc blende ZnS, GaAs; half-Heusler compounds",
    217: "α-manganese",
    221: "CsCl; cubic perovskite SrTiO₃; Cu₃Au; ReO₃",
    223: "A15 superconductors Nb₃Sn, Cr₃Si",
    225: "rock salt NaCl, MgO; fluorite CaF₂; fcc metals Cu, Al; Heusler compounds",
    227: "diamond, silicon, germanium; spinel MgAl₂O₄; pyrochlores",
    229: "bcc metals α-Fe, W, Na",
    230: "garnets, e.g. Y₃Al₅O₁₂ (YAG)",
}
CENTRING = {
    "P": "primitive",
    "A": "A-centred", "B": "B-centred", "C": "C-centred",
    "I": "body-centred (I)",
    "F": "face-centred (F)",
    "R": "rhombohedral (R), described here in hexagonal axes",
}
FRAC = {"1/2": "½", "1/4": "¼", "3/4": "¾", "1/3": "⅓", "2/3": "⅔", "1/6": "⅙", "5/6": "⅚",
        "1/8": "⅛", "3/8": "⅜", "5/8": "⅝", "7/8": "⅞"}


# ---------- formatting ----------
def clean(xyz: str) -> str:
    return xyz.replace(" ", "")


def hm_html(sym: str) -> str:
    """'P 1 2_1/c 1' -> HTML with subscripts, overbars and narrow spaces (matches SGCore.hmHTML)."""
    s = html.escape(sym).replace(" ", " ")
    s = re.sub(r"_(\d)", r"<sub>\1</sub>", s)
    return re.sub(r"-(\d)", r'<span class="ob">\1</span>', s)


def hm_ascii(sym: str) -> str:
    """The spelling people type: 'P2_1/c' -> 'P21/c', 'F 4_1/d -3 2/m' -> 'F41/d-32/m'."""
    return sym.replace("_", "").replace(" ", "")


def schoenflies_html(s: str) -> str:
    """'C2h^5' -> 'C<sub>2h</sub><sup>5</sup>'."""
    m = re.match(r"([A-Z])([^\^]*)\^(\d+)", s)
    return f"{m.group(1)}<sub>{m.group(2)}</sub><sup>{m.group(3)}</sup>" if m else html.escape(s)


def coord_html(xyz: str) -> str:
    """'-x,y+1/2,-z+1/2' -> '−x, y+½, −z+½'."""
    s = re.sub(r"(\d+)/(\d+)", lambda m: FRAC.get(m.group(0), m.group(0)), xyz)
    return s.replace("-", "−").replace(",", ", ")


def site_html(s: str) -> str:
    return re.sub(r"-(\d)", r'<span class="ob">\1</span>', html.escape(s))


def frac_html(v: float) -> str:
    for d in (1, 2, 3, 4, 6, 8):
        n = round(v * d)
        if abs(n - v * d) < 1e-6:
            return "0" if n == 0 else str(n) if d == 1 else FRAC.get(f"{n}/{d}", f"{n}/{d}")
    return f"{v:.3f}"


# ---------- data ----------
def group_data(n: int) -> dict:
    g = Group(n)
    t = spglib.get_spacegroup_type(g.hall_number)
    wyckoff = []
    for wp in g:  # general position first, then towards 'a'
        wp.get_site_symmetry()
        wyckoff.append({
            "m": wp.multiplicity,
            "l": wp.letter,
            "site": wp.site_symm,
            "coords": [clean(op.as_xyz_str()) for op in wp.ops],
        })
    ops = g[0].ops
    centring = [op.translation_vector % 1 for op in ops
                if (abs(op.rotation_matrix - [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) < 1e-6).all()
                and any(abs(x) > 1e-6 for x in op.translation_vector % 1)]
    return {
        "number": n,
        "short": t.international_short,
        "full": t.international_full,
        "schoenflies": t.schoenflies,
        "system": g.lattice_type,
        "pointGroup": t.pointgroup_international,
        "choice": t.choice,
        "centrosymmetric": bool(g.inversion),
        "sohncke": bool(g.chiral),
        "polar": bool(g.polar),
        "example": EXAMPLES.get(n, ""),
        "ops": [clean(op.as_xyz_str()) for op in ops],
        "wyckoff": wyckoff,
        "_centring": [[float(x) for x in c] for c in centring],
    }


# ---------- static HTML for one group ----------
def summary_text(d: dict) -> str:
    """One unique paragraph per group, written from its data (HTML)."""
    n, wy = d["number"], d["wyckoff"]
    gen, special = wy[0], wy[1:]
    short_a, full_a = hm_ascii(d["short"]), hm_ascii(d["full"])
    nobar = short_a.replace("-", "")
    parts = [f'{hm_html(d["short"])} (No. {n}; full symbol {hm_html(d["full"])}; '
             f'Schoenflies symbol {schoenflies_html(d["schoenflies"])}) is a {d["system"]} space group '
             f'in the crystal class {hm_html(d["pointGroup"])}. Its lattice is {CENTRING[d["short"][0]]}.']
    props = "It is centrosymmetric" if d["centrosymmetric"] else "It is non-centrosymmetric"
    if d["sohncke"]:
        props += (" and a Sohncke group: it contains no inversion, mirror or glide operations, "
                  "so it can hold a single enantiomer of a chiral molecule")
    if d["polar"]:
        props += ", and it is polar"
    parts.append(props + ".")
    parts.append(f'A general point has {gen["m"]} equivalent positions per conventional cell'
                 f'{f" ({len(d["ops"]) // (len(d["_centring"]) + 1)} for each of the {len(d["_centring"]) + 1} lattice points)" if d["_centring"] else ""}.')
    if special:
        a = special[-1]
        parts.append(f'There are {len(wy)} Wyckoff positions, from {a["m"]}<i>{a["l"]}</i> '
                     f'(site symmetry {site_html(a["site"])}) to the general position {gen["m"]}<i>{gen["l"]}</i>.')
    else:
        parts.append(f'It has a single Wyckoff position, the general position {gen["m"]}<i>{gen["l"]}</i>.')
    alias = [short_a] + ([nobar] if nobar != short_a else [])
    if full_a != short_a:
        alias.append(full_a)
    parts.append("The symbol is also written " + ", ".join(dict.fromkeys(alias)) + ".")
    if d["example"]:
        parts.append(f'Examples: {html.escape(d["example"])}.')
    return " ".join(parts)


def centring_prefix(d: dict) -> str:
    if not d["_centring"]:
        return ""
    vecs = [[0.0, 0.0, 0.0]] + d["_centring"]
    return "&ensp;".join(f'({", ".join(frac_html(v) for v in c)})+' for c in vecs)


def reference_html(d: dict, idx: list[dict]) -> str:
    n, nc = d["number"], len(d["_centring"]) + 1
    reps = d["ops"][: len(d["ops"]) // nc]
    prefix = centring_prefix(d)
    ops_rows = "\n".join(f'<tr><td>({i + 1})</td><td class="m">{coord_html(o)}</td></tr>' for i, o in enumerate(reps))
    wy_rows = "\n".join(
        f'<tr><td class="m">{w["m"]}</td><td class="m"><i>{w["l"]}</i></td><td class="m">{site_html(w["site"])}</td>'
        f'<td class="m coords">{(f"<span class=cent>{prefix}</span> " if prefix else "")}'
        f'{" ".join(f"({coord_html(c)})" for c in w["coords"][: w["m"] // nc])}</td></tr>'
        for w in d["wyckoff"])
    same_class = [g for g in idx if g["pg"] == d["pointGroup"] and g["n"] != n]
    link = lambda g: f'<a href="../{g["n"]}/">{g["n"]} {hm_html(g["s"])}</a>'
    related = (f'<p><b>Same crystal class ({hm_html(d["pointGroup"])}):</b> '
               + (", ".join(link(g) for g in same_class) or "none, this is the only one") + ".</p>")
    neighbours = [g for g in (idx[n - 2] if n > 1 else None, idx[n] if n < 230 else None) if g]
    return f"""<section class="group-ref prose" id="reference">
      <h2>{hm_html(d["short"])} at a glance</h2>
      <p class="summary">{summary_text(d)}</p>
      <h3>Symmetry operations</h3>
      <p>Coordinate triplets of the general position in the standard setting{" (listed once; add each centring vector)" if prefix else ""}.</p>
      {f'<p class="m">{prefix}</p>' if prefix else ""}
      <div class="scroll-x"><table class="tbl ops"><thead><tr><th></th><th>Coordinates</th></tr></thead><tbody>
      {ops_rows}
      </tbody></table></div>
      <h3>Wyckoff positions</h3>
      <div class="scroll-x"><table class="tbl wyck"><thead><tr><th>Mult.</th><th>Letter</th><th>Site symmetry</th><th>Coordinates</th></tr></thead><tbody>
      {wy_rows}
      </tbody></table></div>
      <form class="ext" method="post" action="https://cryst.ehu.es/cgi-bin/cryst/programs/nph-wp-list" target="_blank">
        <input type="hidden" name="gnum" value="{n}">
        <button type="submit" name="standard" value="Standard/Default Setting">Compare with the Bilbao Crystallographic Server (WYCKPOS) ↗</button>
      </form>
      <h3>Related space groups</h3>
      {related}
      <p><b>Neighbouring numbers:</b> {", ".join(link(g) for g in neighbours)}.
        <a href="../#sys-{d["system"]}">All {d["system"]} space groups</a> ·
        <a href="../">Space-group symmetry tutorial</a></p>
    </section>"""


def head_html(d: dict) -> str:
    return f"""<h1><span class="no">Space group {d["number"]}</span>{hm_html(d["short"])}</h1>
      <dl class="head-facts">
        <div><dt>Full symbol</dt><dd>{hm_html(d["full"])}</dd></div>
        <div><dt>Crystal system</dt><dd>{d["system"]}</dd></div>
        <div><dt>Point group</dt><dd>{hm_html(d["pointGroup"])}</dd></div>
        <div><dt>Schoenflies</dt><dd>{schoenflies_html(d["schoenflies"])}</dd></div>
        <div><dt>Operations</dt><dd>{len(d["ops"])}</dd></div>
        <div><dt>Wyckoff positions</dt><dd>{len(d["wyckoff"])}</dd></div>
      </dl>"""


def nav_html(n: int, idx: list[dict]) -> str:
    out = []
    if n > 1:
        g = idx[n - 2]
        out.append(f'<a href="../{g["n"]}/" rel="prev">← {g["n"]} {hm_html(g["s"])}</a>')
    if n < 230:
        g = idx[n]
        out.append(f'<a href="../{g["n"]}/" rel="next">{g["n"]} {hm_html(g["s"])} →</a>')
    return "".join(out)


def meta(d: dict) -> tuple[str, str]:
    n, short_a = d["number"], hm_ascii(d["short"])
    nobar = short_a.replace("-", "")
    title = f"Space group {n} ({short_a}): Wyckoff positions and symmetry operations"
    names = short_a + (f", {nobar}" if nobar != short_a else "")
    desc = (f"Space group {n}, {names} (full symbol {d['full'].replace('_', '')}): {d['system']}, "
            f"point group {d['pointGroup']}.")
    if d["example"]:
        desc += f" Examples: {d['example']}."
    desc += f" Interactive 3D view of its {len(d['ops'])} symmetry operations and {len(d['wyckoff'])} Wyckoff positions."
    return title, desc


def jsonld(d: dict, title: str, desc: str) -> str:
    url = f"{BASE}{d['number']}/"
    data = [
        {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Space groups", "item": BASE},
            {"@type": "ListItem", "position": 2, "name": f"No. {d['number']} {hm_ascii(d['short'])}", "item": url}]},
        {"@context": "https://schema.org", "@type": "LearningResource", "name": title, "description": desc, "url": url,
         "learningResourceType": "interactive resource", "educationalLevel": "university", "inLanguage": "en",
         "isAccessibleForFree": True, "author": AUTHOR,
         "about": {"@type": "Thing", "name": f"Space group {hm_ascii(d['short'])}"},
         "isPartOf": {"@type": "LearningResource", "name": "Space-group symmetry", "url": BASE}},
    ]
    return json.dumps(data, ensure_ascii=False, indent=1).replace("</", "<\\/")


# ---------- guide page: static group list ----------
def browse_item(g: dict) -> str:
    search = " ".join([str(g["n"]), hm_ascii(g["s"]), hm_ascii(g["s"]).replace("-", ""), g["f"], g["ex"]]).lower()
    title = f' title="{html.escape(g["ex"])}"' if g["ex"] else ""
    return (f'<a href="{g["n"]}/" data-q="{html.escape(search)}" data-c="{str(g["c"]).lower()}" '
            f'data-k="{str(g["k"]).lower()}"{title}><span class="no">{g["n"]}</span><span>{hm_html(g["s"])}</span></a>')


def browse_html(idx: list[dict]) -> str:
    out = []
    for sys in SYSTEMS:
        gs = [g for g in idx if g["sys"] == sys]
        rows = []
        for pg in dict.fromkeys(g["pg"] for g in gs):
            items = "".join(browse_item(g) for g in gs if g["pg"] == pg)
            rows.append(f'<div class="pg-row"><span class="pg m" title="Point group">{hm_html(pg)}</span><div class="items">{items}</div></div>')
        out.append(f'<section class="sys-block" id="sys-{sys}"><h3>{sys.capitalize()} '
                   f'<span class="muted">{gs[0]["n"]}–{gs[-1]["n"]}</span></h3>\n' + "\n".join(rows) + "\n</section>")
    return "\n".join(out)


def main() -> None:
    datas = [group_data(n) for n in range(1, 231)]
    idx = [{"n": d["number"], "s": d["short"], "f": d["full"], "sys": d["system"], "pg": d["pointGroup"],
            "order": len(d["ops"]), "nw": len(d["wyckoff"]), "c": d["centrosymmetric"], "k": d["sohncke"],
            "ex": d["example"]} for d in datas]

    template = TEMPLATE.read_text()
    for d in datas:
        n = d["number"]
        title, desc = meta(d)
        public = {k: v for k, v in d.items() if not k.startswith("_")}
        page = (template
                .replace("{{NUMBER}}", str(n))
                .replace("{{TITLE}}", html.escape(title))
                .replace("{{DESCRIPTION}}", html.escape(desc, quote=True))
                .replace("{{URL}}", f"{BASE}{n}/")
                .replace("{{IMAGE}}", IMAGE)
                .replace("{{JSONLD}}", jsonld(d, title, desc))
                .replace("{{NAV}}", nav_html(n, idx))
                .replace("{{HEAD}}", head_html(d))
                .replace("{{REFERENCE}}", reference_html(d, idx))
                .replace("{{DATA}}", json.dumps(public, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")))
        (OUT / str(n)).mkdir(exist_ok=True)
        (OUT / str(n) / "index.html").write_text(page)
        print(f"{n:3d} {d['short']:<12} {len(d['ops']):3d} ops  {len(d['wyckoff']):2d} Wyckoff positions")

    (OUT / "data").mkdir(exist_ok=True)
    (OUT / "data" / "index.js").write_text(
        "/* Generated by scripts/build_symmetry.py: one entry per space group. */\n"
        "window.SG_INDEX = " + json.dumps(idx, ensure_ascii=False, separators=(",", ":")) + ";\n")

    guide = GUIDE.read_text()
    begin, end = "<!-- BEGIN groups (generated by scripts/build_symmetry.py) -->", "<!-- END groups -->"
    a, b = guide.index(begin) + len(begin), guide.index(end)
    GUIDE.write_text(guide[:a] + "\n" + browse_html(idx) + "\n" + guide[b:])


if __name__ == "__main__":
    main()
