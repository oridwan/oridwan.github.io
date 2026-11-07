#!/usr/bin/env node
/**
 * Build the DFT course pages under dft/.
 *
 * Reads
 *   dft/course.json        course metadata, parts and the ordered lecture list
 *   dft/terms.json         glossary terms, VASP tags and references shared by all lectures
 *   dft/_src/<slug>.html   the authored body of every lecture whose status is "published"
 * and writes
 *   dft/index.html         the course home
 *   dft/<slug>/index.html  one static, crawlable page per published lecture: math pre-rendered
 *                          by KaTeX, plus head, structured data, slide rail, "Where this fits",
 *                          key terms, references and prev/next navigation
 *
 * Markup in dft/_src/<slug>.html, replaced at build time:
 *   \( … \)  \[ … \]            inline and display math; \eqterm{id}{tex} marks a clickable term,
 *                               explained by <li data-eq="id"> in a <ul class="eq-legend">
 *   <x-term k="id">text</x-term>  link to a glossary term (terms.json "terms")
 *   <x-tag>ENCUT</x-tag>          link to a VASP tag (terms.json "tags")
 *   <x-ref k="KEY" p="eq. 3"></x-ref>  citation chip (terms.json "refs"); p is optional. Lectures in
 *                               the textbook voice use none: their sources are checked, not cited, and
 *                               course.json "reading" lists a few for "Further reading" instead
 *   <!-- … -->                   removed before the build: fact-check provenance for the author
 *   <x-lec n="21"></x-lec>         "Lecture 21", linked once lecture 21 is published
 *   <section class="deck-slide" id="…">   one slide each, in this order:
 *     <h2>question</h2> <p class="claim">answer</p> evidence …   the 16:9 frame
 *     <div class="notes"> … </div>                               the narration under it (optional)
 *   </section>
 *   <div class="notes"> … </div> before the first slide           notes for the title slide
 *   <div class="fig-body" data-snapshot="name"></div>  filled with the static SVG returned by
 *                               snapshots.name() of dft/figs/<slug>.js, so the figure is in the
 *                               page before (and without) JavaScript
 * Terms, tags and references used on a page are collected into its "Key terms" and
 * "References" sections (or "Further reading"), which are also what the popovers show.
 *
 * Run:  npm install && node scripts/build_dft.mjs
 *       --demo  also builds dft/_src/_demo.html into dft/_demo/ (noindex, not committed)
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";

const require = createRequire(import.meta.url);
const katex = require("katex");
const KATEX_VERSION = require("katex/package.json").version;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DFT = join(ROOT, "dft");
const course = JSON.parse(readFileSync(join(DFT, "course.json"), "utf8"));
const terms = JSON.parse(readFileSync(join(DFT, "terms.json"), "utf8"));
const DEMO = process.argv.includes("--demo");
const YEAR = 2026;

const lectures = course.lectures;
const bySlug = new Map(lectures.map(l => [l.slug, l]));
const byN = new Map(lectures.map(l => [l.n, l]));
const parts = new Map(course.parts.map(p => [p.id, p]));
const isPub = l => l && l.status === "published";

// ---------- helpers ----------

const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const strip = s => String(s).replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const json = o => JSON.stringify(o, null, 2).replace(/</g, "\\u003c");
const lecNo = l => l.label || `Lecture ${l.n}`;
const fail = msg => { throw new Error(msg); };

const KATEX_OPTS = {
  output: "htmlAndMathml",
  throwOnError: true,
  strict: code => (code === "htmlExtension" ? "ignore" : "error"),
  trust: ctx => ctx.command === "\\htmlData",
  macros: { "\\eqterm": "\\htmlData{eq=#1}{#2}" },
};

const unent = s => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

function tex(src, displayMode, where) {
  try {
    return katex.renderToString(unent(src.trim()), { ...KATEX_OPTS, displayMode });
  } catch (e) {
    fail(`${where}: ${e.message}\n  in: ${src.trim().slice(0, 120)}`);
  }
}

/** Render \[ … \] and \( … \) in an HTML fragment. */
const math = (html, where) => html
  .replace(/\\\[([\s\S]+?)\\\]/g, (_, t) => tex(t, true, where))
  .replace(/\\\(([\s\S]+?)\\\)/g, (_, t) => tex(t, false, where));

const tagId = name => "tag-" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-");

/** Replace x-term / x-tag / x-ref markup; returns the HTML and what was used, in order of first use. */
function links(html, where, lecBase = "../") {
  const used = { terms: [], tags: [], refs: [] };
  const note = (list, k) => { if (!list.includes(k)) list.push(k); };
  html = html.replace(/<x-term k="([^"]+)">([\s\S]*?)<\/x-term>/g, (_, k, text) => {
    if (!terms.terms[k]) fail(`${where}: unknown term "${k}" (add it to dft/terms.json)`);
    note(used.terms, k);
    return `<a class="term" href="#term-${k}">${text}</a>`;
  });
  html = html.replace(/<x-tag>([^<]+)<\/x-tag>/g, (_, name) => {
    if (!terms.tags[name]) fail(`${where}: unknown VASP tag "${name}" (add it to dft/terms.json)`);
    note(used.tags, name);
    return `<a class="vtag" href="#${tagId(name)}">${name}</a>`;
  });
  html = html.replace(/<x-ref k="([^"]+)"(?: p="([^"]*)")?>\s*<\/x-ref>/g, (_, k, p) => {
    const r = terms.refs[k] || fail(`${where}: unknown reference "${k}" (add it to dft/terms.json)`);
    note(used.refs, k);
    return `<a class="ref" href="#ref-${k}">${esc(r.cite)}${p ? `, ${esc(p)}` : ""}</a>`;
  });
  // another lecture: linked once it is published, plain text until then
  html = html.replace(/<x-lec n="(\d+)">([\s\S]*?)<\/x-lec>/g, (_, n, text) => {
    const l = byN.get(+n) || fail(`${where}: unknown lecture ${n}`);
    const label = text.trim() || lecNo(l);
    return isPub(l) ? `<a class="lec-link" href="${lecBase}${l.slug}/">${label}</a>`
                    : `<span class="lec-ref" title="${esc(l.title)} (in preparation)">${label}</span>`;
  });
  const left = html.match(/<x-(term|tag|ref|lec)\b[^>]*>/);
  if (left) fail(`${where}: malformed markup ${left[0]}`);
  return { html, used };
}

function refItem(k, howRead = true) {
  const r = terms.refs[k];
  const out = [r.text];
  if (r.doi) out.push(`<a href="https://doi.org/${esc(r.doi)}" rel="noopener">doi:${esc(r.doi)}</a>`);
  else if (r.url) out.push(`<a href="${esc(r.url)}" rel="noopener">${esc(r.urlLabel || "Link")}</a>`);
  if (r.free) out.push(`<a href="${esc(r.free)}" rel="noopener">${esc(r.freeLabel || "Free copy")}</a>`);
  for (const [label, href] of r.links || []) out.push(`<a href="${esc(href)}" rel="noopener">${esc(label)}</a>`);
  // how the source was used: "Read <date>", or a note such as "Abstract read" / "Quoted as in …"
  const how = howRead ? [r.readNote, r.read].filter(Boolean).join(" ") : "";
  if (how) out.push(`<span class="read">${esc(r.readNote ? how : "Read " + how)}</span>`);
  return `<li id="ref-${k}">${math(out.join(" · "), `ref ${k}`)}</li>`;
}

/** Key terms for the terms/tags used on a page; then its references, or the "reading" list if it has one. */
function backMatter(used, reading, where) {
  let html = "";
  if (used.terms.length || used.tags.length) {
    html += `<section class="backmatter" id="key-terms">\n<h2>Key terms</h2>\n`;
    if (used.terms.length) {
      html += `<dl class="terms">\n` + used.terms.map(k => {
        const t = terms.terms[k];
        return `<dt id="term-${k}">${esc(t.name)}</dt>\n<dd>${math(t.def, `term ${k}`)}</dd>`;
      }).join("\n") + `\n</dl>\n`;
    }
    if (used.tags.length) {
      html += `<h3>VASP tags in this lecture</h3>\n<dl class="terms tags">\n` + used.tags.map(name => {
        const t = terms.tags[name];
        const meta = [];
        if (t.default) meta.push(`Default: ${t.default}`);
        meta.push(`<a href="${esc(t.wiki)}" rel="noopener">VASP Wiki: ${name}</a>`);
        return `<dt id="${tagId(name)}"><code>${name}</code></dt>\n<dd>${math(t.def, `tag ${name}`)}<span class="tag-meta">${meta.join(" · ")}</span></dd>`;
      }).join("\n") + `\n</dl>\n`;
    }
    html += `</section>\n`;
  }
  if (reading) {
    if (used.refs.length) fail(`${where}: a lecture with a "reading" list cites nothing inline, but uses <x-ref k="${used.refs[0]}">`);
    for (const k of reading) if (!terms.refs[k]) fail(`${where}: unknown reference "${k}" in course.json "reading"`);
    html += `<section class="backmatter" id="further-reading">\n<h2>Further reading</h2>\n<ol class="refs">\n${reading.map(k => refItem(k, false)).join("\n")}\n</ol>\n</section>\n`;
  } else if (used.refs.length) {
    html += `<section class="backmatter" id="references">\n<h2>References</h2>\n<ol class="refs">\n${used.refs.map(refItem).join("\n")}\n</ol>\n</section>\n`;
  }
  return html;
}

// ---------- shared page parts ----------

const person = () => ({
  "@type": "Person",
  name: course.author.name,
  url: course.author.url,
  jobTitle: course.author.jobTitle,
  affiliation: { "@type": "CollegeOrUniversity", name: course.author.affiliation },
  sameAs: course.author.sameAs,
});

function head({ title, description, url, image, imageAlt = course.imageAlt, keywords = [], published, modified, jsonld, up, noindex, type = "article", css = [] }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  ${keywords.length ? `<meta name="keywords" content="${esc(keywords.join(", "))}">\n  ` : ""}${noindex ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${url}">`}
  <link rel="icon" href="${up}assets/favicon.svg" type="image/svg+xml">
  <meta name="author" content="${esc(course.author.name)}">
  <meta property="og:type" content="${type}">
  <meta property="og:locale" content="en_US">
  <meta property="og:site_name" content="${esc(course.author.name)}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${url}">
  <meta property="og:image" content="${image}">
  <meta property="og:image:alt" content="${esc(imageAlt)}">${published ? `
  <meta property="article:published_time" content="${published}">
  <meta property="article:modified_time" content="${modified || published}">` : ""}
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(title)}">
  <meta name="twitter:description" content="${esc(description)}">
  <meta name="twitter:image" content="${image}">
  <meta name="twitter:image:alt" content="${esc(imageAlt)}">
${jsonld.map(o => `  <script type="application/ld+json">\n${json({ "@context": "https://schema.org", ...o })}\n  </script>`).join("\n")}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;0,8..60,700;1,8..60,400&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@${KATEX_VERSION}/dist/katex-swap.min.css" crossorigin="anonymous">
  <link rel="stylesheet" href="${up}style.css">
  <link rel="stylesheet" href="${up}dft/dft.css">${css.map(c => `\n  <link rel="stylesheet" href="${up}${c}">`).join("")}
</head>`;
}

function topbar({ up, crumbs, present }) {
  return `<header class="dft-top">
  <div class="dft-top-in">
    <a class="brand" href="${up}">${esc(course.author.name)}</a>
    <nav class="crumbs" aria-label="Breadcrumb">${crumbs}</nav>
    <div class="top-actions">${present ? `<button type="button" class="notes-btn" title="Speaker notes in a new window (S)">Notes</button><button type="button" class="present-btn" title="Presentation mode (P)">Present</button>` : ""}</div>
  </div>
  ${present ? `<div class="progress" aria-hidden="true"><span></span></div>` : ""}
</header>`;
}

const copyright = `<footer class="site-copy">
  <p>© ${YEAR} ${esc(course.author.name)}. All rights reserved. The text, figures, interactive tools and code of this course may not be copied, republished or adapted without written permission. <a href="https://github.com/oridwan/oridwan.github.io/blob/main/LICENSE">Copyright and permissions</a></p>
</footer>`;

function crumbList(items) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map(([name, item], i) => ({ "@type": "ListItem", position: i + 1, name, item })),
  };
}

// ---------- lecture page ----------

async function lecturePage(l, srcPath, outDir, { noindex = false } = {}) {
  const where = `dft/_src/${l.slug}.html`;
  for (const f of ["description", "published", "modified", "minutes", "outcomes"]) {
    if (!l[f]) fail(`${where}: course.json entry for "${l.slug}" needs "${f}" before it can be published`);
  }
  let src = readFileSync(srcPath, "utf8").replace(/<!--[\s\S]*?-->/g, "");
  const figPath = join(DFT, "figs", `${l.slug}.js`);
  const snaps = existsSync(figPath) ? (await import(pathToFileURL(figPath).href)).snapshots || {} : {};
  src = src.replace(/<div class="fig-body" data-snapshot="([^"]+)"><\/div>/g, (_, name) => {
    const f = snaps[name] || fail(`${where}: dft/figs/${l.slug}.js has no snapshots.${name}()`);
    return `<div class="fig-body">${f()}</div>`;
  });
  const { html: linked, used } = links(src, where);
  const rendered = math(linked, where);
  const back = backMatter(used, l.reading, where);

  // notes for the title slide: an optional <div class="notes"> before the first slide
  const intro = rendered.match(/^\s*<div class="notes">([\s\S]*?)<\/div>\s*(?=<section)/);
  const sections = [...rendered.matchAll(/<section class="deck-slide([^"]*)" id="([^"]+)">([\s\S]*?)<\/section>/g)];
  if (!sections.length) fail(`${where}: no <section class="deck-slide" id="…"> found`);
  const total = sections.length + 1;
  const footer = k => `<p class="frame-foot"><span>${esc(course.short)} · ${lecNo(l)}</span><span>${k} / ${total}</span></p>`;

  // every slide: a 16:9 frame (question, claim, evidence) and the notes under it
  const slides = [];
  const body = sections.map(([, cls, id, inner], i) => {
    const notesAt = inner.indexOf('<div class="notes">');
    const frame = (notesAt < 0 ? inner : inner.slice(0, notesAt)).trim();
    const notes = notesAt < 0 ? "" : inner.slice(notesAt).trim();
    const head = frame.match(/^<h2>([\s\S]*?)<\/h2>\s*<p class="claim">([\s\S]*?)<\/p>/)
      || fail(`${where}: slide "${id}" must start with <h2>question</h2> and <p class="claim">answer</p>`);
    if (/<h2[\s>]/.test(notes)) fail(`${where}: slide "${id}" has an <h2> in its notes`);
    slides.push({ id, title: strip(head[1]) });
    const evidence = frame.slice(head[0].length).trim();
    return `<section class="deck-slide${cls}" id="${id}">
<div class="frame"><div class="frame-in">
${head[0]}
<div class="ev">
${evidence}
</div>
</div>${footer(i + 2)}</div>
${notes}
</section>`;
  }).join("\n\n") + "\n\n" + back;
  const leftover = rendered.replace(intro ? intro[0] : "", "").replace(/<section class="deck-slide[^"]*" id="[^"]+">[\s\S]*?<\/section>/g, "").trim();
  if (leftover) fail(`${where}: content outside the slides: ${strip(leftover).slice(0, 80)}`);
  for (const m of back.matchAll(/<section class="backmatter" id="([^"]+)">\s*<h2>([\s\S]*?)<\/h2>/g)) slides.push({ id: m[1], title: strip(m[2]), back: true });
  const ids = new Set();
  for (const s of slides) { if (ids.has(s.id)) fail(`${where}: duplicate slide id "${s.id}"`); ids.add(s.id); }

  const part = parts.get(l.part);
  const url = course.base + l.slug + "/";
  const image = l.image || course.image;
  const title = `${l.seo} | ${course.short}`;

  const prereq = (l.prereq || []).map(s => {
    const p = bySlug.get(s) || fail(`${where}: unknown prerequisite "${s}"`);
    return isPub(p) ? `<a href="../${p.slug}/">${esc(p.title)}</a>` : esc(p.title);
  });
  const fits = `<div class="fits" role="group" aria-label="Where this lecture fits">
  <div><p class="fits-k">You will be able to explain</p><ul>${l.outcomes.map(o => `<li>${math(o, where)}</li>`).join("")}</ul></div>
  <div><p class="fits-k">Before this</p><p>${prereq.length ? prereq.join(", ") : "Nothing beyond calculus and first-year physics."}</p>
    <p class="fits-k">Time</p><p>About ${l.minutes} minutes</p></div>
</div>`;

  // previous and next lecture in course order; unpublished ones are named but not linked
  const near = d => byN.get(l.n + d);
  const navCard = (p, rel) => {
    if (!p) return "<span></span>";
    const inner = `<span class="nav-k">${rel === "prev" ? "Previous" : "Next"} · ${lecNo(p)}</span>${esc(p.title)}`;
    return isPub(p) ? `<a class="lec-nav-${rel}" href="../${p.slug}/" rel="${rel}">${inner}</a>`
                    : `<span class="lec-nav-${rel} soon">${inner}<span class="nav-k">In preparation</span></span>`;
  };

  const keywords = [...(l.keywords || []), "density functional theory", "VASP"];
  const citations = (l.reading || used.refs).map(k => terms.refs[k]).map(r => ({
    "@type": "CreativeWork", name: strip(r.text), ...(r.doi ? { url: "https://doi.org/" + r.doi } : r.url ? { url: r.url } : {}),
  }));
  const jsonld = [
    {
      "@type": ["Article", "LearningResource"],
      headline: l.title,
      name: l.title,
      description: l.description,
      url, mainEntityOfPage: url, image,
      inLanguage: "en",
      author: person(),
      datePublished: l.published,
      dateModified: l.modified,
      isAccessibleForFree: true,
      learningResourceType: ["lecture", "interactive resource"],
      educationalLevel: "university",
      timeRequired: `PT${l.minutes}M`,
      position: l.n,
      ...(l.teaches ? { teaches: l.teaches } : {}),
      keywords: keywords.join(", "),
      isPartOf: { "@type": "Course", name: course.name, url: course.base },
      ...(citations.length ? { citation: citations } : {}),
      copyrightHolder: person(),
      copyrightYear: YEAR,
    },
    crumbList([[course.author.name, course.author.url], [course.short, course.base], [l.title, url]]),
  ];

  const page = `${head({ title, description: l.description, url, image, keywords, published: l.published, modified: l.modified, jsonld, up: "../../", noindex })}
<body class="dft lecture" data-slug="${l.slug}">
<a class="skip-link" href="#main">Skip to content</a>
${topbar({ up: "../../", present: true, crumbs: `<a href="../">${esc(course.short)}</a><span>${lecNo(l)}</span>` })}

<div class="lec">
  <nav class="rail" aria-label="Slides in this lecture">
    <ol>
${slides.map(s => `      <li${s.back ? ' class="back"' : ""}><a href="#${s.id}">${esc(s.title)}</a></li>`).join("\n")}
    </ol>
  </nav>

  <main id="main" class="lec-main">
<header class="deck-slide deck-title" id="top">
<div class="frame"><div class="frame-in">
  <p class="eyebrow">${lecNo(l)} · ${part.id === "0" ? "" : `Part ${part.id}: `}${esc(part.title)}</p>
  <h1>${esc(l.title)}</h1>
  <p class="question">${esc(l.question)}</p>
  ${fits}
  <p class="byline">By <a href="${course.author.url}">${esc(course.author.name)}</a> · Last reviewed <time datetime="${l.modified}">${l.modified}</time></p>
</div>${footer(1)}</div>
${intro ? `<div class="notes">${intro[1].trim()}</div>` : ""}
<p class="present-hint">Press <kbd>P</kbd> to present one slide at a time, <kbd>S</kbd> for speaker notes.</p>
</header>

${body}
    <footer class="lec-foot">
      <section class="author-box" aria-label="About the author">
        <p class="fits-k">About the author</p>
        <p class="author-name"><a href="${course.author.url}">${esc(course.author.name)}</a></p>
        <p>${esc(course.author.bio)}</p>
      </section>
      <nav class="lec-nav" aria-label="Lectures">${navCard(near(-1), "prev")}${navCard(near(+1), "next")}</nav>
      <p class="back"><a href="../">All lectures in the ${esc(course.short)}</a></p>
    </footer>
  </main>
</div>

${copyright}
<script type="module" src="../deck.js"></script>
</body>
</html>
`;
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "index.html"), page);
  return sections.length + 1;
}

// ---------- course home ----------

/** The course home's link block to the cheat sheets (empty until one is published). */
function cheatBlock() {
  const pub = cheats.sheets.filter(s => s.status === "published");
  if (!pub.length) return "";
  return `<section class="home-block cheat-block" aria-labelledby="cheat-h">
    <div class="home-in">
      <h2 id="cheat-h">VASP cheat sheets</h2>
      <p>The practical side of the course: what to type, how to check that it worked and what usually goes wrong, organized by task and checked against VASP ${esc(cheats.vasp)}.</p>
      <ul class="cheat-links">
        ${pub.map(s => `<li><a href="${cheats.dir}/${s.slug}/"><b>${esc(s.short)}</b> ${esc(s.card)}</a></li>`).join("\n        ")}
      </ul>
      <p><a class="btn btn-sm" href="${cheats.dir}/">All VASP cheat sheets</a></p>
    </div>
  </section>`;
}

function homePage() {
  const pub = lectures.filter(isPub);
  const url = course.base;
  const first = lectures.find(isPub);

  const thread = course.thread.map(t => {
    const l = byN.get(t.n);
    const label = math(t.label, "course.json thread");
    return isPub(l) ? `<li><a class="pill" href="${l.slug}/">${label}</a></li>` : `<li><span class="pill">${label}</span></li>`;
  }).join("\n      ");

  const partsHtml = course.parts.map(p => {
    const ls = lectures.filter(l => l.part === p.id);
    const cards = ls.map(l => {
      const inner = `<span class="card-no">${lecNo(l)}</span>
          <h3>${esc(l.title)}</h3>
          <p class="card-q">${esc(l.question)}</p>
          <p class="card-meta">${isPub(l) ? `About ${l.minutes} minutes<span class="card-done"> · Completed</span>` : "In preparation"}</p>`;
      return isPub(l)
        ? `<li class="card" data-slug="${l.slug}"><a href="${l.slug}/">${inner}</a></li>`
        : `<li class="card soon">${inner}</li>`;
    }).join("\n        ");
    const roman = p.id === "0" ? "" : `Part ${p.id} · `;
    return `<section class="part" id="part-${p.id.toLowerCase()}">
      <h2><span class="part-no">${roman}</span>${esc(p.title)}</h2>
      <ol class="cards">
        ${cards}
      </ol>${p.milestone ? `\n      <p class="milestone"><b>Milestone.</b> ${esc(p.milestone)}</p>` : ""}
    </section>`;
  }).join("\n\n    ");

  const errata = course.errata.length
    ? `<h3>Corrections</h3>\n      <ul class="errata">${course.errata.map(e => `<li><time>${esc(e.date)}</time> ${e.html}</li>`).join("")}</ul>`
    : "";

  const jsonld = [
    {
      "@type": "Course",
      name: course.name,
      alternateName: course.short,
      description: course.description,
      url, image: course.image,
      inLanguage: "en",
      isAccessibleForFree: true,
      educationalLevel: "university",
      teaches: course.teaches,
      ...(course.keywords ? { keywords: course.keywords.join(", ") } : {}),
      coursePrerequisites: "Calculus and introductory physics",
      author: person(),
      provider: person(),
      copyrightHolder: person(),
      copyrightYear: YEAR,
      ...(pub.length ? { hasPart: pub.map(l => ({ "@type": "LearningResource", name: l.title, url: url + l.slug + "/", position: l.n })) } : {}),
    },
    crumbList([[course.author.name, course.author.url], [course.short, url]]),
  ];

  const page = `${head({ title: course.homeTitle, description: course.description, url, image: course.image, keywords: course.keywords || [], jsonld, up: "../", type: "website" })}
<body class="dft dft-home">
<a class="skip-link" href="#main">Skip to content</a>
${topbar({ up: "../", crumbs: `<span>${esc(course.short)}</span>` })}

<main id="main">
  <header class="home-hero">
    <div class="home-in">
      <p class="eyebrow">Free interactive course · ${lectures.length - 1} lectures and a capstone · ${course.parts.length - 1} parts</p>
      <h1>${esc(course.name)}</h1>
      <p class="tagline">${esc(course.tagline)}</p>
      <p class="home-lede">Density functional theory (DFT) is the method behind most electronic-structure calculations of real materials, and VASP is one of its most widely used codes. This course builds both from first principles: the quantum mechanics you need, the Hohenberg–Kohn and Kohn–Sham theory, exchange–correlation functionals, k-points, plane waves and PAW, and then the calculations used in research, from relaxations and magnetism to phonons, migration barriers and machine-learning potentials.</p>
      <p class="home-cta">${first
        ? `<a class="btn btn-primary" href="${first.slug}/">Start with ${lecNo(first)}</a> <a class="btn continue" href="${first.slug}/" hidden>Continue</a>`
        : `<span class="soon-note">The first lectures are in preparation.</span>`}</p>
    </div>
  </header>

  <section class="home-block thread-block" aria-labelledby="thread-h">
    <div class="home-in">
      <h2 id="thread-h">The thread through the course</h2>
      <p>Each idea makes the next one necessary. Follow the chain from the Schrödinger equation to a VASP calculation.</p>
      <ol class="thread">
      ${thread}
      </ol>
    </div>
  </section>

  <section class="home-block how" aria-labelledby="how-h">
    <div class="home-in">
      <h2 id="how-h">How the lectures work</h2>
      <div class="how-grid">
        <div><h3>Slides with the lecture underneath</h3><p>Each lecture is a set of 16:9 slides, and under each slide are the notes of what is said about it. Read the page like an article, or press <kbd>P</kbd> to present the slides full screen.</p></div>
        <div><h3>Interactive figures</h3><p>Change a parameter and watch the physics respond. Every number in a figure is computed in your browser; model systems are labelled as models.</p></div>
        <div><h3>Self-contained</h3><p>Every symbol is defined where it appears and the key equations are derived, with worked numbers, so you can learn without another book open. Terms and VASP tags open a short explanation in place.</p></div>
      </div>
    </div>
  </section>

  ${cheatBlock()}
  <div class="home-in syllabus">
    ${partsHtml}
  </div>

  <section class="home-block" aria-labelledby="who-h">
    <div class="home-in two">
      <div>
        <h2 id="who-h">Who this course is for</h2>
        <p>Students and researchers who want to understand what a DFT calculation does, not only how to run one. You need calculus and first-year physics; quantum mechanics is taught from the start. You need access to VASP only for the hands-on labs.</p>
        <p>Also on this site: <a href="../symmetry/">an interactive guide to crystallographic symmetry and the 230 space groups</a>, the language behind POSCAR files and k-point meshes.</p>
      </div>
      <div>
        <h2 id="checked-h">How the course is checked</h2>
        <ul class="checked">
          <li>Every claim is checked against primary papers, textbooks, lecture notes and the official VASP documentation before it is published. Each lecture ends with a short list of further reading.</li>
          <li>VASP tags and defaults are checked against the VASP Wiki when a lecture is written.</li>
          <li>Numbers in interactive figures come from code tested against exact results.</li>
          <li>Lab results come from real VASP runs, never invented output.</li>
          <li>Each lecture is fact-checked independently before it is published.</li>
        </ul>
      ${errata}
      </div>
    </div>
  </section>

  <section class="home-block about" aria-labelledby="about-h">
    <div class="home-in">
      <h2 id="about-h">About the instructor</h2>
      <p class="author-name"><a href="${course.author.url}">${esc(course.author.name)}</a></p>
      <p>${esc(course.author.bio)}</p>
    </div>
  </section>
</main>

${copyright}
<script type="module" src="deck.js"></script>
</body>
</html>
`;
  writeFileSync(join(DFT, "index.html"), page);
}

// ---------- VASP cheat sheets ----------
/*
 * Reads dft/cheatsheets.json and dft/_cheat/<slug>.html; writes the hub dft/vasp-cheat-sheets/
 * and one page per published sheet. Extra markup in the sheet sources:
 *   <section class="sheet-sec" id="…"><h2>…</h2> … </section>   one section each; feeds the contents list
 *   <x-tags names="ENCUT PREC …"></x-tags>   a tag table from terms.json (short, default, use, pitfall)
 *   <pre class="incar" data-title="…" [data-allow="rule-id …"]>…</pre>   an INCAR block, checked with
 *                         cheat-tools.js: an unknown tag, a non-ASCII character or an error-level rule
 *                         (unless allowed) fails the build
 *   <pre class="sh" data-title="…">…</pre>   a shell block
 *   <x-sheet slug="kpoints">text</x-sheet>   another sheet: linked once it is published
 *   <x-tag>, <x-lec>  as in the lectures
 */

const cheats = JSON.parse(readFileSync(join(DFT, "cheatsheets.json"), "utf8"));
const { lintIncar, parsePoscar, parseKpoints } = await import(pathToFileURL(join(DFT, "cheat-tools.js")).href);
const sheets = cheats.sheets;
const isSheetPub = s => s && s.status === "published";
const bySheet = new Map(sheets.map(s => [s.slug, s]));
const knownTags = new Set(Object.keys(terms.tags));
const longDate = iso => new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const groupTitle = id => (cheats.groups.find(g => g.id === id) || fail(`cheatsheets.json: unknown group "${id}"`)).title;

function tagTable(names, where) {
  const rows = names.trim().split(/\s+/).map(name => {
    const t = terms.tags[name] || fail(`${where}: <x-tags> names unknown tag "${name}" (add it to dft/terms.json)`);
    if (!t.short || !t.use) fail(`${where}: tag ${name} needs "short" and "use" in dft/terms.json to appear in a table`);
    return `<tr id="${tagId(name)}"><th scope="row"><a class="wiki" href="${esc(t.wiki)}" rel="noopener" title="${name} on the VASP Wiki"><code>${name}</code></a>${t.since ? ` <span class="since" title="Needs VASP ${esc(t.since)} or later">${esc(t.since)}+</span>` : ""}${t.vtst ? ` <span class="since vtst" title="Needs VASP compiled with the VTST code">VTST</span>` : ""}</th>`
      + `<td data-label="What it does">${t.short}</td><td data-label="Default">${t.default || "—"}</td><td data-label="What to use">${t.use}</td><td data-label="Watch out">${t.pitfall || ""}</td></tr>`;
  });
  return `<div class="tagtable-wrap"><table class="tagtable">
<thead><tr><th scope="col">Tag</th><th scope="col">What it does</th><th scope="col">Default</th><th scope="col">What to use</th><th scope="col">Watch out</th></tr></thead>
<tbody>
${rows.join("\n")}
</tbody>
</table></div>`;
}

/** INCAR and shell blocks: checked, highlighted, wrapped in a captioned figure (cheat.js adds the copy button). */
function codeBlocks(html, where) {
  return html.replace(/<pre class="(incar|sh|poscar|kpoints|file)"([^>]*)>([\s\S]*?)<\/pre>/g, (_, kind, attrs, body) => {
    const attr = k => (attrs.match(new RegExp(`${k}="([^"]*)"`)) || [])[1];
    const title = attr("data-title") || fail(`${where}: a ${kind} block needs data-title`);
    const allow = (attr("data-allow") || "").split(/\s+/).filter(Boolean);
    const text = unent(body).replace(/^\n/, "").replace(/\s+$/, "");
    const bad = text.match(/[^\x00-\x7f]/);
    if (bad) fail(`${where}: "${title}": non-ASCII character "${bad[0]}" in a ${kind} block (keep input files plain ASCII)`);
    let code;
    if (kind === "incar") {
      for (const p of lintIncar(text, knownTags)) {
        if (p.id === "unlisted") fail(`${where}: "${title}" uses ${p.tag}, which is not in dft/terms.json tags`);
        if (p.level === "error" && !allow.includes(p.id)) fail(`${where}: "${title}": ${p.message}`);
        if (p.level === "warn" && !allow.includes(p.id)) console.warn(`    note  ${where}: "${title}": ${p.message}`);
      }
      code = text.split("\n").map(line => {
        const i = line.search(/[!#]/);
        const stmt = i < 0 ? line : line.slice(0, i), com = i < 0 ? "" : line.slice(i);
        return esc(stmt).replace(/\b([A-Z][A-Z0-9_]*)(?=\s*=)/g, '<span class="k">$1</span>') + (com ? `<span class="c">${esc(com)}</span>` : "");
      }).join("\n");
    } else if (kind !== "sh") {
      if (kind === "poscar") {
        const p = parsePoscar(text);
        if (p.errors.length && !allow.includes("poscar-error")) fail(`${where}: POSCAR "${title}": ${p.errors.join(" ")}`);
      }
      if (kind === "kpoints") {
        const k = parseKpoints(text);
        if (k.errors.length) fail(`${where}: KPOINTS "${title}": ${k.errors.join(" ")}`);
      }
      code = text.split("\n").map(line => {
        const i = line.search(/[!#]/);
        return i < 0 ? esc(line) : esc(line.slice(0, i)) + `<span class="c">${esc(line.slice(i))}</span>`;
      }).join("\n");
    } else {
      code = text.split("\n").map(line => {
        const i = line.search(/(^|\s)#/);
        return i < 0 ? esc(line) : esc(line.slice(0, i)) + `<span class="c">${esc(line.slice(i))}</span>`;
      }).join("\n");
    }
    return `<figure class="code ${kind}"><figcaption><span class="code-t">${esc(title)}</span></figcaption><pre><code>${code}</code></pre></figure>`;
  });
}

function sheetLinks(html, where, base) {
  return html.replace(/<x-sheet slug="([^"]+)">([\s\S]*?)<\/x-sheet>/g, (_, slug, text) => {
    const [name, hash = ""] = slug.split("#");
    const s = bySheet.get(name) || fail(`${where}: unknown cheat sheet "${name}"`);
    return isSheetPub(s) ? `<a href="${base}${s.slug}/${hash ? "#" + hash : ""}">${text}</a>`
                         : `<span class="lec-ref" title="${esc(s.h1)} (in preparation)">${text}</span>`;
  });
}

/** Which published sheet shows each tag in a table (the first one wins). */
function tagSheets() {
  const map = new Map();
  for (const s of sheets.filter(isSheetPub)) {
    const src = readFileSync(join(DFT, "_cheat", `${s.slug}.html`), "utf8");
    for (const [, names] of src.matchAll(/<x-tags names="([^"]+)"><\/x-tags>/g))
      for (const n of names.trim().split(/\s+/)) if (!map.has(n)) map.set(n, s);
  }
  return map;
}

function sheetPage(s) {
  const where = `dft/_cheat/${s.slug}.html`;
  const url = `${cheats.base}${s.slug}/`;
  let src = readFileSync(join(DFT, "_cheat", `${s.slug}.html`), "utf8").replace(/<!--[\s\S]*?-->/g, "");
  src = src.replace(/<x-tags names="([^"]+)"><\/x-tags>/g, (_, names) => tagTable(names, where));
  src = src.replace(/data-tool="incar-builder"/g, `data-tool="incar-builder" data-known="${[...knownTags].sort().join(" ")}"`);
  src = codeBlocks(src, where);
  src = sheetLinks(src, where, "../");
  const { html: body0, used } = links(src, where, "../../");
  if (used.refs.length) fail(`${where}: cheat sheets cite nothing inline; use "reading" in cheatsheets.json`);
  const body = math(body0, where);

  const toc = [...body.matchAll(/<section class="sheet-sec" id="([^"]+)">\s*<h2>([\s\S]*?)<\/h2>/g)]
    .map(([, id, h]) => `<li><a href="#${id}">${strip(h)}</a></li>`).join("\n        ");
  if (!toc) fail(`${where}: no <section class="sheet-sec" id="…"><h2> found`);

  // tags linked with <x-tag> but not shown in a table on this page get a short glossary
  const extra = used.tags.filter(name => !body.includes(`id="${tagId(name)}"`));
  let back = "";
  if (extra.length) {
    back += `<section class="backmatter" id="key-terms">\n<h2>Other tags on this sheet</h2>\n<dl class="terms tags">\n` + extra.map(name => {
      const t = terms.tags[name];
      return `<dt id="${tagId(name)}"><code>${name}</code></dt>\n<dd>${math(t.short || t.def, `tag ${name}`)}<span class="tag-meta">${t.default ? `Default: ${t.default} · ` : ""}<a href="${esc(t.wiki)}" rel="noopener">VASP Wiki: ${name}</a></span></dd>`;
    }).join("\n") + `\n</dl>\n</section>\n`;
  }
  if (s.lectures?.length) {
    back += `<section class="backmatter" id="lectures">\n<h2>The physics behind this sheet</h2>\n<ul class="sheet-lecs">\n` + s.lectures.map(n => {
      const l = byN.get(n) || fail(`cheatsheets.json: ${s.slug} lists unknown lecture ${n}`);
      return isPub(l) ? `<li><a href="../../${l.slug}/">${lecNo(l)}: ${esc(l.title)}</a></li>`
                      : `<li>${lecNo(l)}: ${esc(l.title)} <span class="muted">(in preparation)</span></li>`;
    }).join("\n") + `\n</ul>\n</section>\n`;
  }
  for (const k of s.reading || []) if (!terms.refs[k]) fail(`cheatsheets.json: unknown reference "${k}" in ${s.slug}`);
  if (s.reading?.length) back += `<section class="backmatter" id="further-reading">\n<h2>Further reading</h2>\n<ol class="refs">\n${s.reading.map(k => refItem(k, false)).join("\n")}\n</ol>\n</section>\n`;

  const pub = sheets.filter(isSheetPub);
  const i = pub.indexOf(s);
  const prev = pub[i - 1], next = pub[i + 1];
  const pn = `<nav class="sheet-pn" aria-label="Other cheat sheets">
    ${prev ? `<a class="pn-prev" href="../${prev.slug}/"><span>Previous sheet</span>${esc(prev.short)}</a>` : `<span></span>`}
    <a class="pn-hub" href="../">All VASP cheat sheets</a>
    ${next ? `<a class="pn-next" href="../${next.slug}/"><span>Next sheet</span>${esc(next.short)}</a>` : `<span></span>`}
  </nav>`;

  const jsonld = [
    {
      "@type": ["TechArticle", "LearningResource"],
      headline: s.title, name: s.h1, description: s.description, url,
      image: cheats.hub.image, inLanguage: "en", isAccessibleForFree: true,
      learningResourceType: "Cheat sheet",
      keywords: [...(s.keywords || []), "VASP", "VASP cheat sheet"].join(", "),
      datePublished: s.published, dateModified: s.modified,
      author: person(), publisher: person(),
      isPartOf: { "@type": "Course", name: course.name, url: course.base },
      ...(s.reading?.length ? { citation: s.reading.map(k => strip(terms.refs[k].text)) } : {}),
    },
    crumbList([[course.author.name, course.author.url], [course.short, course.base], ["VASP cheat sheets", cheats.base], [s.short, url]]),
  ];

  const page = `${head({ title: s.title, description: s.description, url, image: cheats.hub.image, imageAlt: cheats.hub.imageAlt, keywords: [...(s.keywords || []), "VASP"], published: s.published, modified: s.modified, jsonld, up: "../../../", css: ["dft/cheat.css"] })}
<body class="dft cheat" data-sheet="${s.slug}">
<a class="skip-link" href="#main">Skip to content</a>
${topbar({ up: "../../../", crumbs: `<a href="../../">${esc(course.short)}</a><a href="../">VASP cheat sheets</a><span>${esc(s.short)}</span>` })}

<main id="main" class="sheet">
  <header class="sheet-head">
    <p class="eyebrow">VASP cheat sheet · ${esc(groupTitle(s.group))}</p>
    <h1>${esc(s.h1)}</h1>
    <p class="sheet-lede">${esc(s.lede)}</p>
    <p class="stamp">Checked against VASP ${esc(cheats.vasp)} · Updated <time datetime="${s.modified}">${longDate(s.modified)}</time> <button type="button" class="print-btn">Print</button></p>
  </header>
  <div class="sheet-grid">
    <nav class="sheet-toc" aria-label="On this sheet">
      <p class="toc-k">On this sheet</p>
      <ol>
        ${toc}
      </ol>
    </nav>
    <article class="sheet-body">
${body}
${back}
    </article>
  </div>
  ${pn}
</main>

${copyright}
<script type="module" src="../../deck.js"></script>
<script type="module" src="../../cheat.js"></script>
</body>
</html>
`;
  const out = join(DFT, cheats.dir, s.slug);
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "index.html"), page);
}

function cheatHub() {
  const h = cheats.hub;
  const url = cheats.base;
  const pub = sheets.filter(isSheetPub);
  // only tasks whose sheet is published; the others appear once their sheet does
  const tasks = cheats.tasks.filter(t => {
    const s = bySheet.get(t.sheet) || fail(`cheatsheets.json: task "${t.text}" names unknown sheet "${t.sheet}"`);
    return isSheetPub(s);
  }).map(t => {
    const s = bySheet.get(t.sheet);
    return `<li><a href="${s.slug}/${t.anchor ? "#" + t.anchor : ""}"><span>${esc(t.text)}</span><b>${esc(s.short)}</b></a></li>`;
  }).join("\n        ");

  const node = (slug, label) => {
    const s = bySheet.get(slug) || fail(`hub map: unknown sheet ${slug}`);
    return isSheetPub(s) ? `<a class="node" href="${slug}/">${label}</a>` : `<span class="node soon" title="In preparation">${label}</span>`;
  };
  const map = `<ol class="wmap">
        <li><span class="wmap-k">Prepare</span>${node("poscar", "POSCAR")}${node("potcar", "POTCAR")}${node("kpoints", "KPOINTS")}${node("incar-tags", "INCAR")}</li>
        <li><span class="wmap-k">Run</span>${node("slurm-job-script", "Slurm job script")}</li>
        <li><span class="wmap-k">Read</span>${node("outcar-oszicar-grep", "OUTCAR, OSZICAR")}</li>
        <li><span class="wmap-k">Fix</span>${node("errors-and-fixes", "Errors and fixes")}</li>
        <li><span class="wmap-k">Workflows</span>${node("relaxation-workflow", "Relax → static → DOS and bands")}${node("properties", "Properties")}${node("magnetism-magmom", "Magnetism")}${node("neb", "Barriers (NEB)")}${node("aimd-mlff", "MD and ML force fields")}</li>
      </ol>`;

  const groups = cheats.groups.map(g => {
    const cards = sheets.filter(s => s.group === g.id).map(s => {
      const chips = (s.sample || []).map(t => `<code>${esc(t)}</code>`).join(" ");
      const inner = `<h3>${esc(s.short)}</h3>
          <p>${esc(s.card)}</p>
          <p class="cs-meta">${chips}${s.tool ? `<span class="cs-tool">${esc(s.tool)}</span>` : ""}</p>
          <p class="cs-status">${isSheetPub(s) ? "Open the sheet →" : "In preparation"}</p>`;
      return isSheetPub(s)
        ? `<li class="cs-card" data-search="${esc((s.short + " " + s.card + " " + (s.sample || []).join(" ")).toLowerCase())}"><a href="${s.slug}/">${inner}</a></li>`
        : `<li class="cs-card soon" data-search="${esc((s.short + " " + s.card).toLowerCase())}">${inner}</li>`;
    }).join("\n        ");
    return `<section class="cs-group" aria-labelledby="g-${g.id}">
      <h2 id="g-${g.id}">${esc(g.title)}</h2>
      <p class="cs-blurb">${esc(g.blurb)}</p>
      <ol class="cs-cards">
        ${cards}
      </ol>
    </section>`;
  }).join("\n    ");

  // A–Z index of every tag in terms.json
  const onSheet = tagSheets();
  const index = Object.keys(terms.tags).sort().map(name => {
    const t = terms.tags[name];
    const where = [];
    const sh = onSheet.get(name);
    if (sh) where.push(`<a href="${sh.slug}/#${tagId(name)}">${esc(sh.short)} sheet</a>`);
    const l = t.lecture != null ? byN.get(t.lecture) : null;
    if (isPub(l)) where.push(`<a href="../${l.slug}/">${lecNo(l)}</a>`);
    return `<tr id="${tagId(name)}" data-search="${esc((name + " " + strip(t.short || t.def)).toLowerCase())}"><th scope="row"><a class="wiki" href="${esc(t.wiki)}" rel="noopener"><code>${name}</code></a></th><td data-label="What it does">${math(t.short || t.def, `tag ${name}`)}</td><td data-label="Default">${t.default || "—"}</td><td data-label="More">${where.join(" · ") || "—"}</td></tr>`;
  }).join("\n");

  const jsonld = [
    {
      "@type": "CollectionPage",
      name: h.h1, headline: h.title, description: h.description, url,
      image: h.image, inLanguage: "en", isAccessibleForFree: true,
      keywords: h.keywords.join(", "),
      datePublished: h.published, dateModified: [h.modified, ...pub.map(s => s.modified)].sort().pop(),
      author: person(), publisher: person(),
      isPartOf: { "@type": "Course", name: course.name, url: course.base },
      ...(pub.length ? { mainEntity: { "@type": "ItemList", itemListElement: pub.map((s, i) => ({ "@type": "ListItem", position: i + 1, name: s.h1, url: `${url}${s.slug}/` })) } } : {}),
    },
    crumbList([[course.author.name, course.author.url], [course.short, course.base], ["VASP cheat sheets", url]]),
  ];

  const page = `${head({ title: h.title, description: h.description, url, image: h.image, imageAlt: h.imageAlt, keywords: h.keywords, jsonld, up: "../../", type: "website", css: ["dft/cheat.css"] })}
<body class="dft cheat cheat-hub">
<a class="skip-link" href="#main">Skip to content</a>
${topbar({ up: "../../", crumbs: `<a href="../">${esc(course.short)}</a><span>VASP cheat sheets</span>` })}

<main id="main">
  <header class="home-hero hub-hero">
    <div class="home-in">
      <p class="eyebrow">Free reference · Checked against VASP ${esc(cheats.vasp)}</p>
      <h1>${esc(h.h1)}</h1>
      <p class="home-lede">${esc(h.lede)}</p>
      <form class="hub-search" role="search" onsubmit="return false">
        <label for="hub-q" class="visually-hidden">Search the cheat sheets and the tag index</label>
        <input id="hub-q" type="search" placeholder="Search sheets and INCAR tags, e.g. ISMEAR" autocomplete="off">
      </form>
    </div>
  </header>

  <section class="home-block" aria-labelledby="task-h">
    <div class="home-in">
      <h2 id="task-h">Start from your task</h2>
      <ul class="tasks">
        ${tasks}
      </ul>
    </div>
  </section>

  <section class="home-block" aria-labelledby="map-h">
    <div class="home-in">
      <h2 id="map-h">Where each sheet fits</h2>
      <p>A calculation moves through the same stages every time. Each box opens its sheet.</p>
      ${map}
    </div>
  </section>

  <div class="home-in cs-groups">
    ${groups}
  </div>

  <section class="home-block" aria-labelledby="index-h" id="tag-index">
    <div class="home-in">
      <h2 id="index-h">INCAR tag index, A to Z</h2>
      <p>Every tag used in the course and the sheets, with its default. Each tag name opens its page on the VASP Wiki.</p>
      <div class="tagtable-wrap"><table class="tagtable tag-index">
<thead><tr><th scope="col">Tag</th><th scope="col">What it does</th><th scope="col">Default</th><th scope="col">More</th></tr></thead>
<tbody>
${index}
</tbody>
</table></div>
    </div>
  </section>

  <section class="home-block" aria-labelledby="checked-h">
    <div class="home-in two">
      <div>
        <h2 id="checked-h">How the sheets are checked</h2>
        <ul class="checked">
          <li>Every tag, default and recommendation is read on the VASP Wiki when its sheet is written, and the sheet says which VASP version it was checked against.</li>
          <li>Every INCAR on a sheet is checked by the same rules as the INCAR checker, and the build rejects unknown or misspelled tags.</li>
          <li>Shell commands are tested on real VASP output files.</li>
          <li>Labels separate VASP's own advice from rules of thumb, and say when a setting needs a newer VASP or the VTST add-on.</li>
        </ul>
      </div>
      <div>
        <h2 id="course-h">Part of a course</h2>
        <p>These sheets are the practical side of <a href="../">Density Functional Theory and VASP</a>, a free interactive course that builds the physics behind every tag, from the Schrödinger equation to Kohn–Sham DFT, k-points, plane waves and PAW.</p>
      </div>
    </div>
  </section>
</main>

${copyright}
<script type="module" src="../deck.js"></script>
<script type="module" src="../cheat.js"></script>
</body>
</html>
`;
  mkdirSync(join(DFT, cheats.dir), { recursive: true });
  writeFileSync(join(DFT, cheats.dir, "index.html"), page);
}

// ---------- run ----------

const seen = new Set();
for (const l of lectures) {
  if (seen.has(l.slug)) fail(`course.json: duplicate slug "${l.slug}"`);
  seen.add(l.slug);
  if (!parts.has(l.part)) fail(`course.json: lecture ${l.n} has unknown part "${l.part}"`);
}

homePage();
let count = 0;
for (const l of lectures.filter(isPub)) {
  const n = await lecturePage(l, join(DFT, "_src", `${l.slug}.html`), join(DFT, l.slug));
  console.log(`  ${lecNo(l).padEnd(10)} ${l.slug}  (${n} slides)`);
  count++;
}
if (DEMO) {
  // the demo may bring its own terms, tags and references
  const extra = join(DFT, "_src", "_demo.terms.json");
  if (existsSync(extra)) {
    const t = JSON.parse(readFileSync(extra, "utf8"));
    for (const k of ["terms", "tags", "refs"]) Object.assign(terms[k], t[k] || {});
  }
  const demo = {
    n: -1, label: "Demo", slug: "_demo", part: "0", status: "draft",
    title: "Framework demo", seo: "Framework demo", question: "Does every slide and popover type render?",
    description: "Internal page that exercises every component of the lecture framework.",
    published: "2026-10-30", modified: "2026-10-30", minutes: 5,
    outcomes: ["what each component looks like", "that math renders, e.g. \\(E = \\langle\\psi|\\hat H|\\psi\\rangle\\)"],
  };
  await lecturePage(demo, join(DFT, "_src", "_demo.html"), join(DFT, "_demo"), { noindex: true });
  console.log("  demo       dft/_demo/");
}
const sheetSlugs = new Set();
for (const s of sheets) {
  if (sheetSlugs.has(s.slug)) fail(`cheatsheets.json: duplicate slug "${s.slug}"`);
  sheetSlugs.add(s.slug);
  groupTitle(s.group);
}
let nSheets = 0;
if (sheets.some(isSheetPub)) {
  cheatHub();
  for (const s of sheets.filter(isSheetPub)) { sheetPage(s); nSheets++; console.log(`  sheet      ${cheats.dir}/${s.slug}`); }
}
console.log(`Built dft/index.html, ${count} lecture page(s) and ${nSheets} cheat sheet(s) with KaTeX ${KATEX_VERSION}.`);

if (existsSync(join(ROOT, "scripts", "build_sitemap.py"))) {
  execFileSync("python3", [join(ROOT, "scripts", "build_sitemap.py")], { stdio: "inherit" });
}
