# Density Functional Theory and VASP — course plan (v2.0 draft)

*An interactive course from the Schrödinger equation to calculations you can defend.*
Short name (title suffixes, breadcrumbs): **DFT & VASP Course**. Address: `/dft/`. See §6.

Revised from **LearnDFT Master Curriculum v1.0** and the Lecture 1–3 notes in Google Drive
(`LearnDFT/`). Status: plan for review; nothing built yet.

---

## 1. Audience and goal

- **Audience:** anyone starting DFT from scratch, from students to researchers. Some calculus and
  first-year physics assumed; no quantum mechanics or VASP experience assumed.
- **One course, one sequence:** 37 lectures + capstone, no levels or alternative paths. Long
  derivations sit in collapsible "Going deeper" panels so slides stay readable.
- **Goal (kept from v1.0):** *Run VASP → Understand VASP → Defend the calculation scientifically.*

## 2. What changed from v1.0, and why

| Change | Reason |
| --- | --- |
| **New L0 Orientation** | A from-scratch student needs the map and a first look at a VASP run before the theory. |
| **New L4 Atoms and orbitals** | s/p/d/f, shells, and core vs valence are needed for POTCAR choices (Ti vs Ti_pv), PDOS, and DFT+U. v1.0 skipped them. |
| **v1.0 L4 split into L5 + L6** | Antisymmetry, Hartree, Hartree–Fock and correlation were packed into one lesson. HF is also the first SCF, which L12 builds on. |
| **Thomas–Fermi added to L7** | It shows why an orbital-free kinetic energy fails, which is the motivation for Kohn–Sham. |
| **New L11 LDA and GGA** | v1.0 had no lecture on LDA itself. "What exactly does PBE approximate?" deserves its own lecture. |
| **xc (L10–11) moved before SCF (L12)** | The SCF demo then runs a complete, real LDA calculation. |
| **New L19 Anatomy of a VASP run + convergence** | Practical lecture once ENCUT, k-points, smearing, and POTCAR are understood. |
| **New L22 Equations of state and elastic constants** | Listed on the site's current "planned chapters". |
| **New L24 SOC and magnetic anisotropy** | Central to rare-earth permanent magnets (research tie). |
| **v1.0 L21 split into L26 meta-GGA + L28 vdW** | Dispersion is different physics (long-range correlation), and r²SCAN is used in our own papers. |
| **v1.0 L26 split into L31 phonons, L32 NEB, L33 AIMD** | Each one is a full workflow with its own VASP tags. |
| **Sources expanded** | Added undergraduate texts (Griffiths, Sholl & Steckel, Ashcroft & Mermin), VASP method papers, and one primary paper per method. |
| **Labs use real outputs only** | See §7. |

## 3. Site structure

```
dft/
  course.json                single source of truth: order, slug, title tag, H1, meta description,
                             central question, part, prerequisites, dates, status
  terms.json                 glossary + VASP tags + references → popups, "Key terms" sections,
                             and the reference pages
  _src/<slug>.html           lecture bodies as authored (TeX math, term/source markup); not linked,
                             disallowed in robots.txt
  index.html                 GENERATED course home
  <slug>/index.html          GENERATED lecture pages (slugs, never numbers, so renumbering is safe)
  glossary/ vasp-tags/ references/ toolkit/<slug>/   GENERATED reference pages
  dft.css                    builds on ../style.css tokens (like symmetry/symmetry.css)
  deck.js                    slides, progress, presentation mode, popovers, quizzes
  num.js                     numerical kernels, no DOM, tested under Node (like symmetry/sg-core.js)
  figs/<slug>.js             per-lecture interactive figures (SVG/canvas; three.js r128 for 3D)
scripts/build_dft.mjs        Node build: KaTeX pre-render, <head>/meta/JSON-LD, breadcrumbs,
                             prev/next, author box, Key terms, static figure fallbacks
scripts/test_dft_num.mjs     tests for num.js against analytic and reference values
package.json                 pins katex for the build (node_modules ignored)
```

- **As built (v2, 2026-10-30):** each `<section class="deck-slide">` in `_src` is written as
  `<h2>` question, `<p class="claim">`, evidence, then `<div class="notes">`; the build wraps the
  first three in a 16:9 `.frame` (with the slide number) and leaves the notes under it, and it
  fails if a slide lacks the question or the claim. `deck.js` presents the frames letterboxed,
  reveals `.step` builds one at a time, opens a speaker-notes window (`S`) and turns `.flip`
  cards. A headless-Chrome test checks that no frame overflows (§5.5).
- **As built (Phase 0):** KaTeX 0.19.0 (pinned in `package.json`, CSS from jsDelivr at the same
  version). Slides are `<section class="deck-slide">` (the main site already uses `.slide` for its
  project carousel). `node scripts/build_dft.mjs --demo` builds a git-ignored component demo at
  `dft/_demo/`. `num.js` and its Node tests arrive with L1, the first lecture that computes anything.
- **Why a build step:** the pages Google crawls already contain the rendered math (HTML +
  MathML), and the head, structured data, and navigation stay consistent across 37 pages. This is
  the same pattern as `scripts/build_symmetry.py`.
- `scripts/build_sitemap.py` already picks up every `index.html`; it will also read `<lastmod>`
  from `course.json`.
- Progress and quiz state live in `localStorage` (per visitor, wrapped in try/catch, optional).
- Print stylesheet: any lecture prints as a clean handout (successor to the Drive PDFs).

## 4. Course home page (`/dft/`)

```
┌──────────────────────────────────────────────────────────────────────┐
│ Osman Goni Ridwan › DFT & VASP Course       Glossary · Tags · Sources│
├──────────────────────────────────────────────────────────────────────┤
│ H1  Density Functional Theory and VASP                               │
│ An interactive course from the Schrödinger equation to calculations │
│ you can defend. 37 lectures · 10 parts · free.                       │
│ [Start: Lecture 0]  [Continue: Lecture 5 →]                          │
│                                                                      │
│ THE THREAD (each node links to its lecture)                          │
│ Ĥψ=Eψ → Born–Oppenheimer → many electrons → n(r) → HK → Kohn–Sham    │
│   → E_xc → SCF → Bloch & k → plane waves → PAW → VASP                │
│   → energies & forces → phonons · NEB · MD · ML potentials           │
│                                                                      │
│ PART I  Quantum mechanics you need                     ▓▓▓░░░ 3 / 6  │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐                     │
│  │ 1  What     │ │ 2  Wave-    │ │ 3  Varia-   │  number · title      │
│  │ problem is  │ │ functions…  │ │ tional…     │  central question    │
│  │ VASP solving│ │             │ │             │  ~50 min · ✓         │
│  └─────────────┘ └─────────────┘ └─────────────┘                     │
│  ◆ Milestone I — explain why electronic structure is a many-body     │
│    problem and what "self-consistent" means                          │
│ PART II … (unbuilt lectures listed by title, without links)          │
│                                                                      │
│ REFERENCE SHELF                                                      │
│  Math toolkit · Glossary · VASP tag index · Reading list · Errata    │
│ HOW THIS COURSE IS CHECKED (accuracy policy, last-verified dates)    │
│ ABOUT THE INSTRUCTOR · © notice                                      │
└──────────────────────────────────────────────────────────────────────┘
```

- **The thread** is the signature visual: the logical chain from v1.0's Milestone II, extended to
  the whole course.
- **Lecture cards** show the central question, the hook that makes a student click.
- **VASP tag index:** every INCAR tag → one-line meaning → the lecture that explains it → VASP Wiki
  link. It doubles as a quick reference for researchers.

## 5. Lecture page design (v2, 16:9 slides)

**Revised 2026-10-30 after the first two lectures.** v1 slides were article sections: too much
text, scrolling inside a slide while presenting, and the narrative buried in citations. v2
separates **what the audience sees** from **what the instructor says**.

### 5.1 Two layers per slide

- **The slide**: a fixed 16:9 frame. Its text scales with its width, so a slide looks the same in
  the page, in full-screen presentation and on a projector, and it **never scrolls**. On phones
  (column narrower than 640 px) the frame drops the fixed ratio and reflows.
- **The notes**: under each slide in the page, the narration: what the instructor says, with the
  citations, caveats and "Going deeper" panels. Hidden in presentation mode; `S` opens them in a
  speaker window that follows the slides. The notes are also most of the indexed text.

### 5.2 Slide grammar (assertion–evidence)

Every content slide has three parts, following the assertion–evidence design, which gave better
comprehension and fewer misconceptions than topic-and-bullets slides in a controlled study with
engineering students (Garner & Alley, *Int. J. Eng. Educ.* 29, 1564 (2013),
<https://www.ijee.ie/articles/Vol29-6/23_ijee2791ns.pdf>, abstract read 2026-10-30):

1. **Kicker**: the question the slide answers, as the `<h2>` (the rail, the outline, and
   question-style search queries).
2. **Claim**: the answer in one sentence of at most about 16 words.
3. **Evidence**: one figure, equation, diagram, table (at most 7 rows) or card grid. On-slide prose
   is at most about 40 words; labels sit on the figure, not in a legend far away.

Builds (`.step`) reveal a slide in stages when presenting; in the page everything is visible.

### 5.3 Lecture arc (each lecture, about 18 slides for 40–50 minutes)

| Stage | Slides | Job |
| --- | --- | --- |
| Title | 1 | The lecture's one question; 3–4 outcomes ("you will be able to explain…"); before this; time |
| Hook | 1 | A concrete case that makes the question matter (a calculation, a lab result, a figure) |
| Build | 8–10 | One idea per slide, each needed by the next; at least one interactive figure |
| In VASP | 1–2 | Where the idea lives: tags, files, output lines |
| Lab | 1–2 | Inputs, then *predict, then run*: what the output should show and why |
| Misconceptions | 1 | Flip cards: belief → what is true |
| Check | 1 | Flip cards, **one per outcome** (outcomes, checks and summary are aligned) |
| Summary | 1 | One line per outcome, then the next lecture's question |

### 5.4 Wording rules

- Plain words, short sentences, active voice. Define a term before using it; link its first use.
- One term per idea throughout the course ("nuclei" for the physics, "ions" only inside VASP's
  own vocabulary such as "ionic step", explained once).
- **Textbook voice, not a literature review** (user, 2026-10-30: "We don't need to cite that much
  and tell sources. You will do fact check yourself… keep it informative so I and readers can learn
  ins and outs. They won't need to go to other places to understand anything.")
  - No inline citations, page numbers, "as X put it" or quotations from sources. State the fact.
  - Every claim is still checked against a source. The sources for a lecture are listed in an HTML
    comment at the top of `_src/<slug>.html` (stripped by the build), for the next fact-check.
  - A lecture ends with at most a short "Further reading" list (course.json `"reading"`); the build
    refuses `<x-ref>` chips in a lecture that has one.
  - Names and years of discoveries are fine as history ("Hartree introduced the SCF in 1928").
- **Self-contained:** define every symbol where it appears, derive the key equations (long
  derivations go in a `details.deeper` "Going deeper" block), and give worked numbers that the
  reader can reproduce. Never "see X for details".
- Numbers carry units and only the digits the source gives. Models are labelled as models.
- Notes for a slide: as long as the explanation needs, written to be read, not spoken; the slide
  itself stays one question, one claim, one piece of evidence.

### 5.5 Other parts of the page

- **Popups**: key terms (dotted underline), VASP tags (blue chip), sources (grey chip).
- Built for readers arriving from search: title slide with the part, prerequisites (linked) and
  outcomes; key terms and references as page sections after the slides; author box; visible
  "Last reviewed" date; every figure has a static SVG snapshot in the HTML.
- **Checks per lecture** (in addition to §10): a headless-Chrome test that **no slide overflows its
  16:9 frame** at 1280 × 720 and 1920 × 1080, in the page and in presentation mode.

## 6. SEO plan

*Based on Google Search Central's guidance on URL structure and title links, its structured-data
gallery and Course documentation, and its June 2025 "Simplifying the search results page" post
(all read 2026-10-30). Also based on a check of what currently ranks for the target searches.*

### 6.1 What we're up against
- **Concept searches** ("Kohn-Sham equations explained", "Hohenberg-Kohn theorem"): arXiv PDFs,
  Wikipedia, university lecture notes, mostly static PDFs. A well-structured interactive HTML page
  can compete here.
- **VASP-tag searches** ("ENCUT", "ISMEAR", "k-point convergence VASP"): the VASP Wiki, the VASP
  forum, group tutorials on readthedocs. We won't outrank the wiki for a bare tag name; we target
  the *why / how to converge / explained* intent that the wiki doesn't serve.
- **Course searches** ("DFT course", "learn DFT from scratch"): Coursera (École Polytechnique),
  paid courses, books. No free, interactive DFT + VASP course turned up.

### 6.2 Name, address and titles
- **Course name:** H1 *Density Functional Theory and VASP*; short form *DFT & VASP Course* in title
  suffixes and breadcrumbs. People search both "density functional theory" and "DFT", so the H1
  spells it out. "Course" is searched; "fundamentals" rarely is.
- **Address:** `https://oridwan.github.io/dft/`. It's short and matches `/symmetry/`. Google's
  guidance is readable words separated by hyphens, so each lecture's slug carries the words its
  readers search for.
- **Lecture URLs:** `/dft/<topic-slug>/`, lowercase with hyphens, never the lecture number.
- **`<title>`:** `<Topic as people search it> | DFT & VASP Course`. Keep the topic ≤ ~45 characters
  so it shows untruncated. Titles use the spellings people type (Kohn-Sham, r2SCAN, k-point); the
  body uses proper typography (Kohn–Sham, r²SCAN).
- **H1** = the same topic phrase, because Google builds title links from `<title>` and the first
  visible `<h1>`. The lecture number is a small label above the H1, never in the title.
- **Meta description:** unique per page, ~150 characters: the question and what's interactive.

**Course home:** `<title>` *DFT and VASP Course: Density Functional Theory from Scratch*.

| # | URL `/dft/…/` | `<title>` topic (+ " \| DFT & VASP Course") | Targets searches like |
| --- | --- | --- | --- |
| 0 | `what-is-dft` | Introduction to Density Functional Theory | what is DFT; DFT introduction |
| 1 | `born-oppenheimer-approximation` | Born-Oppenheimer Approximation Explained | Born-Oppenheimer; potential energy surface |
| 2 | `wavefunctions-operators-eigenvalues` | Wavefunctions, Operators and Eigenvalues | eigenvalue equation; expectation value |
| 3 | `variational-principle-basis-sets` | Variational Principle and Basis Sets | variational principle; basis set convergence |
| 4 | `atomic-orbitals-core-valence-electrons` | Atomic Orbitals, Core and Valence Electrons | core vs valence electrons; s p d f orbitals |
| 5 | `pauli-exclusion-slater-determinant` | Pauli Exclusion and Slater Determinants | Slater determinant; antisymmetric wavefunction |
| 6 | `hartree-fock-method` | Hartree-Fock Method and SCF Explained | Hartree-Fock; correlation energy |
| 7 | `electron-density-functionals` | Electron Density, Functionals, Thomas-Fermi | what is a functional; Thomas-Fermi model |
| 8 | `hohenberg-kohn-theorems` | Hohenberg-Kohn Theorems Explained | Hohenberg-Kohn theorem proof |
| 9 | `kohn-sham-equations` | Kohn-Sham Equations Explained | Kohn-Sham equations; Kohn-Sham orbitals |
| 10 | `exchange-correlation-energy` | Exchange-Correlation Energy and the xc Hole | exchange-correlation functional; exchange hole |
| 11 | `lda-gga-pbe` | LDA vs GGA and the PBE Functional | LDA vs GGA; PBE functional |
| 12 | `scf-convergence` | Self-Consistent Field (SCF) Convergence | SCF convergence VASP; charge mixing |
| 13 | `reciprocal-lattice-brillouin-zone` | Reciprocal Lattice and Brillouin Zone | reciprocal lattice; Brillouin zone |
| 14 | `bloch-theorem-band-structure` | Bloch Theorem and Band Structure Explained | Bloch theorem; band folding |
| 15 | `k-point-sampling` | k-Point Sampling and Monkhorst-Pack Grids | k-point convergence; Monkhorst-Pack vs Gamma |
| 16 | `smearing-ismear-sigma` | Smearing in VASP: ISMEAR and SIGMA | ISMEAR; SIGMA; smearing for metals |
| 17 | `plane-wave-cutoff-encut` | Plane-Wave Cutoff: What ENCUT Controls | ENCUT; cutoff energy |
| 18 | `paw-pseudopotentials-potcar` | PAW Method and Choosing a POTCAR | PAW method; POTCAR Ti_pv vs Ti_sv |
| 19 | `vasp-input-files-convergence-tests` | VASP Input Files and Convergence Tests | INCAR explained; VASP convergence test |
| 20 | `formation-energy-convex-hull` | Formation Energy and Convex Hull from DFT | formation energy DFT; energy above hull |
| 21 | `structural-relaxation-ibrion-isif` | Structural Relaxation in VASP: IBRION, ISIF | ISIF; IBRION; VASP relaxation |
| 22 | `equation-of-state-elastic-constants` | Equation of State and Elastic Constants | Birch-Murnaghan fit; elastic constants VASP |
| 23 | `spin-polarized-dft-magnetism` | Spin-Polarized DFT: ISPIN and MAGMOM | MAGMOM; spin-polarized calculation |
| 24 | `spin-orbit-coupling-magnetic-anisotropy` | Spin-Orbit Coupling and Magnetic Anisotropy | magnetic anisotropy energy VASP; LSORBIT |
| 25 | `dft-plus-u` | DFT+U and the Hubbard U Explained | DFT+U; Hubbard U value |
| 26 | `meta-gga-scan-r2scan` | Meta-GGA Functionals: SCAN and r2SCAN | r2SCAN; SCAN functional |
| 27 | `hybrid-functionals-hse06` | Hybrid Functionals and HSE06 Explained | HSE06; hybrid functional VASP |
| 28 | `van-der-waals-dispersion-corrections` | van der Waals Corrections: DFT-D3, vdW-DF | DFT-D3; van der Waals correction |
| 29 | `band-structure-dos` | Band Structure, DOS and PDOS in VASP | band structure VASP; projected DOS |
| 30 | `band-gap-problem` | Why DFT Underestimates Band Gaps | DFT band gap underestimation |
| 31 | `phonons-dynamical-stability` | Phonons and Dynamical Stability with DFT | phonon calculation; imaginary frequencies |
| 32 | `nudged-elastic-band` | Nudged Elastic Band (NEB) Method Explained | NEB; climbing-image NEB |
| 33 | `ab-initio-molecular-dynamics` | Ab Initio Molecular Dynamics (AIMD) | AIMD VASP; ab initio MD |
| 34 | `machine-learning-interatomic-potentials` | Machine-Learning Interatomic Potentials | MLIP; ML potentials from DFT |
| 35 | `dft-errors-convergence-accuracy` | DFT Errors: Convergence vs Accuracy | DFT accuracy; sources of error |
| 36 | `dft-methods-section` | Writing a Defensible DFT Methods Section | DFT computational details |
| C | `vasp-calculation-audit` | Audit a Real VASP Calculation | — |

### 6.3 Structured data (JSON-LD, generated by the build)
- **Course home:** `Course` (name, description, author/provider, `hasPart` → lectures, `teaches`,
  `inLanguage`, `isAccessibleForFree`) + `BreadcrumbList`. Google retired Course Info rich results
  in June 2025, and Course list needs at least three courses with an instructor-led roster, so no
  course rich result is expected. The markup is there to help search engines understand the page.
- **Lectures:** `["Article", "LearningResource"]` with headline, description, author (a `Person`
  with `sameAs` → Google Scholar, ORCID, GitHub, LinkedIn), `datePublished`, `dateModified`,
  image, `isPartOf` the Course, `teaches`, and `citation`; plus `BreadcrumbList`.
- **Glossary:** `DefinedTermSet`. No FAQ markup (it isn't in Google's current gallery).

### 6.4 Speed, internal links and discovery
- **Fast pages:** no framework, figures start only when scrolled into view, figure space reserved
  (no layout shift), mobile-first, and pre-rendered math (no TeX parsing in the browser).
- **Internal links:** the main site's "Learn with me" card and nav dropdown link to `/dft/` and the
  newest lecture. Each glossary term links to the lecture that defines it. Each lecture links its
  prerequisites and the next lecture. The symmetry tutorial and L13 link to each other.
- **No thin pages:** unbuilt lectures are listed on the course home without links. No "coming
  soon" URLs get indexed.
- **Sitemap** with accurate `<lastmod>`; submit it in Search Console and request indexing for each
  new lecture. Each lecture gets a 1200×630 social image from its main figure, plus og/twitter tags.
- **Off-page (yours):** announce each lecture (LinkedIn, X/Bluesky, group site, matsci.org where
  relevant). Link the course from your CV, GitHub profile README, and Google Scholar homepage
  field, and ask the lab and department to link it. Links from university pages are the most
  valuable ones a github.io site can realistically get.

## 7. Accuracy protocol

1. **Read the sources online while writing.** For each lecture I open and read the actual sources:
   VASP Wiki pages, open-access or arXiv versions of the primary papers, Burke's *ABC of DFT*,
   and MIT OCW notes. I read them before writing the claims they support and record each one with
   the date it was read. Every reference links to its DOI and, where a legal free copy exists, to
   that too. If a source can't be read online (a paywalled book or paper), the page says which
   claims rest on it, and I add a second source I could read.
2. **Source tiers from v1.0 kept:** primary paper > textbook/authoritative lecture > official VASP
   docs > supplementary. Since 2026-10-30 sources are recorded, not shown: see §5.4.
3. **VASP specifics** (tags, defaults, OUTCAR labels, recommended values) are checked against the
   VASP Wiki *when each lecture is written*. Each lecture is stamped "VASP details checked YYYY-MM-DD".
4. **No hand-drawn data:** every number in a figure is computed live by code in `num.js`, which is
   tested in Node against analytic or reference results (particle in a box, harmonic oscillator,
   hydrogen, He Hartree–Fock −2.8617 Ha, NIST SRD 141 LDA atomic energies, Müller–Brown
   stationary points, …).
5. **Models are labelled:** any figure that is schematic or a model system says so on the figure.
6. **No invented VASP output:** lab pages show outputs only from real runs (inputs prepared here,
   run on your cluster) or from cited published data.
7. **Independent fact-check per lecture:** a fresh reviewer gets the finished page and its sources,
   not my reasoning, and hunts for errors in physics, signs, units, and VASP claims.
8. **First-student pass:** you go through each lecture as its first student. Every spot where you
   get stuck becomes a popup, a new slide, or a fix.
9. **Errata page** on the course home; corrections are dated.

## 8. Revised syllabus v2.0

Time ≈ 45–60 min each. URLs and title tags are in §6.2.
Source keys from v1.0: HK64, KS65, PBE96, PAW94, KJ99, DFT+U98, HSE, SCAN15; B = Burke, *ABC of
DFT*; Q = MIT 5.61; S = MIT 8.511; V = VASP Wiki/tutorials. New keys are written out.
Citations marked † need their details confirmed when the lecture is written.

### Part 0 — Start here

**L0 · Orientation: what DFT and VASP are for**
- *Q:* What does a DFT calculation compute, and what does VASP do when you press run?
- Arc (as built, v2): a research question decided by energies (carbon frameworks, Ridwan et al.
  2026, Fig. 7) → Kohn's exponential wall → the density → the one approximation (E_xc) → Jacob's
  ladder → what DFT predicts and where it struggles → VASP, its inputs, one run, its outputs →
  Lab 0 → units → course map → misconceptions, checks, summary.
- Interactive: the exponential wall (N and p sliders); clickable "life of a VASP run" with a
  step-through; unit converter.
- Sources: Sholl & Steckel ch. 1; Kohn, Nobel lecture, Rev. Mod. Phys. 71, 1253 (1999); V.

### Part I — Quantum mechanics you need

**L1 · What problem is VASP solving?** · *(v1.0 L1; notes exist)*
- *Q:* What physical system lies underneath POSCAR + POTCAR + INCAR?
- Topics: nuclei and electrons; full Hamiltonian T̂_N+T̂_e+V̂_NN+V̂_ee+V̂_eN; atomic units;
  Born–Oppenheimer; potential-energy surface; F = −∂E/∂R; relaxation as repeated electronic solves.
- Interactive: (a) Hamiltonian explorer: click a term to see which particles interact;
  (b) diatomic energy curve (Morse model, labelled): drag the atom, watch the force arrow, and step
  a relaxation downhill.
- VASP: POSCAR, POTCAR, NSW, EDIFFG, ionic steps in OSZICAR/OUTCAR.
- Sources: Q (Born–Oppenheimer lecture); B; Sholl & Steckel ch. 1.

**L2 · Wavefunctions, operators, eigenvalues** · *(v1.0 L2; notes exist)*
- *Q:* What does Ĥψ = Eψ actually mean?
- Topics: ψ vs |ψ|²; normalization; operators; Hermitian; eigenvalues vs expectation values;
  superposition; orthogonality; bra-ket; operators as matrices.
- Interactive: particle in a box. Mix eigenstates with sliders and see ψ, |ψ|² and ⟨E⟩.
  "Measure" samples energies into a histogram that converges to |c_n|².
- VASP: NBANDS; band and k indices in EIGENVAL; first warning about Kohn–Sham eigenvalues.
- Sources: Q; Griffiths, *Introduction to Quantum Mechanics* chs. 1–3.

**L3 · Variational principle and basis sets** · *(v1.0 L3; notes exist)*
- *Q:* How does an impossible differential equation become a finite calculation?
- Topics: Rayleigh quotient; upper bound; trial functions; basis expansion; Hc = ESc; completeness;
  nested spaces; cost; numerical vs physical error.
- Interactive: (a) Gaussian trial for the harmonic oscillator: E(α) and trial vs exact ψ;
  (b) sine-basis reconstruction with an M slider; (c) 2×2 mixing: slide H₁₂ and watch the
  levels repel.
- VASP: ENCUT preview; default ENCUT = largest ENMAX.
- Sources: Q (5.61 Fall 2017 L24, as cited in the notes); B ch. 3; V (ENCUT).

**L4 · Atoms and orbitals: hydrogen, shells, core and valence** · *new*
- *Q:* Where do s, p, d, f, and "core" vs "valence", come from?
- Topics: hydrogen atom; quantum numbers n, l, m; radial functions and nodes; angular shapes;
  many-electron atoms qualitatively (screening, aufbau and its exceptions, e.g. Cr, Cu);
  core/semicore/valence; why 3d and 4f are compact.
- Interactive: orbital explorer (analytic hydrogen): R_nl, r²R², 2D slice of |ψ|²; core/valence
  panel for Ti showing which shells are in Ti, Ti_pv, Ti_sv (valence counts checked against the
  VASP potential table).
- VASP: ZVAL in POTCAR; s/p/d/f projections (preview of LORBIT).
- Sources: Griffiths ch. 4; Q; V (available PAW potentials).

**L5 · Many electrons: spin, antisymmetry and the exponential wall** · *(v1.0 L4, part 1)*
- *Q:* Why is a solid with 10²³ electrons so much harder than one electron in a potential?
- Topics: many-electron Ψ; spin; identical particles; antisymmetry and Pauli; Slater determinants;
  why storage grows exponentially (Kohn's "exponential wall").
- Interactive: two electrons in a 1D box. A heatmap of |Ψ(x₁,x₂)|² for product, symmetric, and
  antisymmetric states shows the node on x₁ = x₂. Storage calculator: grid points^(3N).
- VASP: why VASP never stores Ψ(r₁…r_N).
- Sources: Q (spin, Pauli); B chs. 4–5; Kohn RMP 1999.

**L6 · Hartree and Hartree–Fock: the first self-consistent field** · *(v1.0 L4, part 2)*
- *Q:* What is the best you can do with one Slater determinant, and what does it miss?
- Topics: mean field; Hartree potential and self-interaction; HF equations; exchange as a
  nonlocal operator; Koopmans' theorem; SCF iteration; correlation energy E_c = E_exact − E_HF.
- Interactive: helium Hartree–Fock solved live in the browser (radial solver). The iteration log
  converges to −2.8617 Ha against the exact −2.9037 Ha; the difference is the correlation energy.
- VASP: SCF vocabulary carried into OSZICAR; preview of exact exchange (L27).
- Sources: Q (HF lecture); S L15–16; Szabo & Ostlund, *Modern Quantum Chemistry* ch. 3.
- ◆ **Milestone I:** explain why electronic structure is a many-body problem and what
  "self-consistent" means.

### Part II — Density functional theory

**L7 · From wavefunctions to density: functionals and Thomas–Fermi** · *(v1.0 L5 + new)*
- *Q:* Can 3 coordinates replace 3N?
- Topics: n(r) from Ψ; normalization to N; function vs functional; functional derivative (gently);
  Thomas–Fermi model and its failures (no shell structure; no molecular binding, Teller 1962);
  why orbitals come back.
- Interactive: "functional machine": change a density and watch N, E_H, E_x^LDA, and T_TF respond
  (real formulas, evaluated numerically).
- Sources: B chs. 2, 6; Parr & Yang, *Density-Functional Theory of Atoms and Molecules*;
  Teller, Rev. Mod. Phys. 34, 627 (1962).

**L8 · The Hohenberg–Kohn theorems**
- *Q:* Why is the density, in principle, enough?
- Topics: external potential; HK1 (uniqueness, proof by contradiction); HK2 (variational);
  universal F[n]; what HK does and doesn't give. Going deeper: v-representability, Levy–Lieb
  constrained search, spin and finite-temperature extensions.
- Interactive: step-through proof. Two potentials and the same density lead to the inequality chain
  and the contradiction.
- Sources: HK64; Levy, PNAS 76, 6062 (1979); B ch. 6; S L17.

**L9 · The Kohn–Sham construction** · *(v1.0 L7)*
- *Q:* How did Kohn and Sham turn an existence theorem into a method?
- Topics: noninteracting reference system; T_s vs T; E = T_s + E_ext + E_H + E_xc + E_NN;
  KS equations; v_eff; what is exact vs approximated; KS orbitals as auxiliary objects;
  ε_HOMO = −I for the exact functional.
- Interactive: energy decomposition for real atoms (He, Be, Ne, Ar) from the in-browser LDA atom
  solver: E_xc is a small slice of the total but decides bonding.
- VASP: the OUTCAR energy breakdown (labels checked against a real OUTCAR).
- Sources: KS65; B ch. 7; Martin, *Electronic Structure*.

**L10 · Exchange–correlation energy and the xc hole** · *(v1.0 L9)*
- *Q:* What physics is hidden inside E_xc?
- Topics: self-interaction in E_H; exchange hole; correlation hole; sum rules (−1 and 0);
  adiabatic connection (going deeper); why E_xc is small but decisive.
- Interactive: exchange hole of the uniform electron gas, g_x = 1 − (9/2)[j₁(k_F r)/(k_F r)]².
  An r_s slider, with the −1 sum rule integrated live.
- Sources: B chs. 13, 16; Gunnarsson & Lundqvist, PRB 13, 4274 (1976); S L15–17.

**L11 · LDA and GGA: what PBE actually approximates** · *new*
- *Q:* What exactly is approximated when INCAR says `GGA = PE`?
- Topics: uniform electron gas, r_s; LDA exchange (exact for the UEG) and correlation (QMC +
  fits); reduced gradient s; enhancement factor F_xc; PBE built from exact constraints
  (κ = 0.804, μ ≈ 0.2195); PBEsol (μ = 10/81); typical trends (LDA overbinds; PBE lattice
  constants slightly too large).
- Interactive: F_x(s) for LDA, PBE, PBEsol (real formulas) with the s-range found in solids marked.
- VASP: GGA tag; POTCAR family consistency; LASPH preview.
- Sources: PBE96; Perdew et al., PRL 100, 136406 (2008); Ceperley & Alder, PRL 45, 566 (1980);
  Perdew & Zunger, PRB 23, 5048 (1981); Perdew & Wang, PRB 45, 13244 (1992); B chs. 8, 17–18;
  Haas, Tran & Blaha, PRB 79, 085104 (2009).

**L12 · Self-consistency: the SCF loop in practice** · *(v1.0 L8)*
- *Q:* Why can't VASP solve the Kohn–Sham equations once and stop?
- Topics: fixed-point problem; n_in → n_out; linear vs Pulay/Broyden mixing; charge sloshing and
  Kerker preconditioning; convergence criteria; iterative diagonalizers (Davidson, RMM-DIIS);
  restarts from WAVECAR/CHGCAR.
- Interactive: (a) the LDA atom solver with a mixing slider: converge, oscillate, or diverge, with
  a log-scale residual plot; linear vs Pulay mixing. (b) Annotated OSZICAR: hover each column.
- VASP: ALGO, EDIFF, NELM, NELMIN, NELMDL, AMIX, BMIX, IMIX, ICHARG, ISTART, LWAVE, LCHARG.
- Sources: Kresse & Furthmüller, PRB 54, 11169 (1996); Pulay, Chem. Phys. Lett. 73, 393 (1980);
  Kerker, PRB 23, 3082 (1981); V.
- ◆ **Milestone II:** Schrödinger → BO → many electrons → n(r) → HK → KS → E_xc → SCF.

### Part III — Electrons in crystals

**L13 · Lattices, reciprocal space and the Brillouin zone** · *(v1.0 L10)*
- *Q:* Why does a crystal lead naturally into reciprocal space?
- Topics: recap of lattices (links into the symmetry tutorial); bᵢ = 2π(aⱼ×a_k)/V; aᵢ·bⱼ = 2πδᵢⱼ;
  BZ as the Wigner–Seitz cell of the reciprocal lattice; high-symmetry points; a bigger cell gives
  a smaller BZ.
- Interactive: (a) 2D real ↔ reciprocal lattices side by side: drag a₁ and a₂;
  (b) 3D Brillouin-zone viewer (sc, fcc, bcc, hex, …) computed as a Wigner–Seitz cell, with
  labelled points (reuses the three.js setup from symmetry/).
- VASP: POSCAR lattice and scale; Direct vs Cartesian; the 2π convention in OUTCAR (to verify).
- Sources: Ashcroft & Mermin chs. 4–5; S L1–2; Setyawan & Curtarolo, Comput. Mater. Sci. 49, 299 (2010).

**L14 · Bloch's theorem and band structure** · *(v1.0 L11)*
- *Q:* What does a k-point physically represent?
- Topics: translation symmetry → Bloch states; n vs k; periodic u_nk; reduced zone; gaps at
  zone boundaries (nearly free electrons); tight binding; band folding in supercells;
  metals vs insulators from band filling.
- Interactive: a 1D crystal solved live in a plane-wave basis. Gaps open as V₀ grows; "double the
  cell" folds the bands; click a band point to see Re ψ_nk(x) and u_nk(x).
- VASP: why supercells have more bands; Γ-only runs; preview of band paths.
- Sources: Ashcroft & Mermin chs. 8–9; Kittel ch. 7; S L5–6.

**L15 · Brillouin-zone integration and k-point meshes** · *(v1.0 L12)*
- *Q:* Why does a periodic calculation need many k-points, and how many?
- Topics: BZ averages; Monkhorst–Pack and Γ-centred meshes; symmetry reduction and weights;
  insulators converge fast, metals slowly; k-density vs cell size; supercell ↔ mesh equivalence.
- Interactive: 2D tight binding. Choose N×N and the shift; see the mesh, the irreducible points
  and their weights, and the integrated band energy vs N for a metal vs an insulator.
- VASP: KPOINTS modes, KSPACING, KGAMMA, IBZKPT; why hexagonal cells need Γ-centred meshes.
- Sources: Monkhorst & Pack, PRB 13, 5188 (1976); Chadi & Cohen, PRB 8, 5747 (1973); V.

**L16 · Metals, occupations and smearing** · *(v1.0 L13)*
- *Q:* What do ISMEAR and SIGMA really do?
- Topics: occupations; Fermi level; Fermi–Dirac, Gaussian, Methfessel–Paxton; tetrahedron with
  Blöchl corrections; generalized free energy F = E − TS (Mermin); σ → 0 extrapolation;
  which scheme for which system.
- Interactive: (a) occupation functions for FD, Gaussian, MP1–2 (MP goes below 0 and above 1);
  (b) model metal: E, F, and the extrapolated E(σ→0) vs σ.
- VASP: ISMEAR, SIGMA; OUTCAR "free energy TOTEN", "energy without entropy", "energy(sigma->0)";
  E-fermi.
- Sources: Methfessel & Paxton, PRB 40, 3616 (1989); Blöchl, Jepsen & Andersen, PRB 49, 16223 (1994);
  Mermin, Phys. Rev. 137, A1441 (1965); V (ISMEAR).

### Part IV — How VASP represents electrons

**L17 · Plane waves, ENCUT and FFT grids** · *(v1.0 L14)*
- *Q:* What exactly does ENCUT truncate?
- Topics: Fourier expansion of Bloch functions; cutoff sphere ħ²|k+G|²/2m < E_cut;
  N_pw ≈ Ω k_cut³/6π²; why cores need huge cutoffs; FFT grids; PREC; Pulay stress.
- Interactive: (a) 2D reciprocal lattice with the cutoff circle: an ENCUT slider counts plane waves,
  and a cell-size slider shows the count growing; (b) Fourier reconstruction of a smooth function
  vs an atomic cusp; (c) the L14 crystal again, converging the band energy vs basis size.
- VASP: ENCUT, ENMAX/ENMIN, PREC, NGX/NGY/NGZ, ENAUG; "number of plane waves" in OUTCAR.
- Sources: Payne et al., Rev. Mod. Phys. 64, 1045 (1992); Kresse & Furthmüller 1996; V (ENCUT;
  Energy cutoff and FFT meshes).

**L18 · Pseudopotentials, PAW and the POTCAR** · *(v1.0 L15)*
- *Q:* Why is choosing a POTCAR a physics decision?
- Topics: frozen core; norm-conserving and ultrasoft pseudopotentials (history); PAW transform
  |ψ⟩ = |ψ̃⟩ + Σᵢ(|φᵢ⟩ − |φ̃ᵢ⟩)⟨p̃ᵢ|ψ̃⟩; augmentation spheres; what a POTCAR contains
  conceptually; variants _pv, _sv, _h, _s, _GW; rare earths with 4f in the core (e.g. Nd_3)
  vs 4f in the valence; LASPH.
- Interactive: (a) all-electron radial function of a real atom (from the atom solver) vs a smooth
  pseudo-function matched at r_c: slide r_c and see smoothness traded against cutoff
  (construction labelled); (b) PAW decomposition: smooth part + on-site correction.
- VASP: choosing potentials; consistency; licensing (POTCARs are never shared).
- Sources: PAW94; KJ99; Vanderbilt, PRB 41, 7892 (1990); Hamann, Schlüter & Chiang,
  PRL 43, 1494 (1979); V (available PAW potentials).

**L19 · Anatomy of a VASP calculation and convergence testing** · *practical, new*
- *Q:* What does each line of my inputs do, and how do I know my numbers are converged?
- Topics: INCAR/POSCAR/KPOINTS/POTCAR line by line; stdout, OSZICAR, OUTCAR, vasprun.xml,
  CONTCAR, CHGCAR, WAVECAR; relax → static → analysis; converging ENCUT and k on the *target
  observable*; what pymatgen/ASE input sets choose and why you still check.
- Interactive: annotated input files (hover any tag); convergence plotter where you paste your own
  E vs ENCUT or k data and get differences plus a tolerance check.
- Lab: Si (insulator) vs Al (metal) convergence, with real outputs.
- Sources: V; Ong et al., Comput. Mater. Sci. 68, 314 (2013) (pymatgen); Larsen et al.,
  J. Phys.: Condens. Matter 29, 273002 (2017) (ASE).
- ◆ **Milestone III:** explain why VASP uses periodic cells, k-points, plane waves, ENCUT, PAW, POTCAR.

### Part V — Energies, forces and structures

**L20 · Total energies and what can be compared** · *(v1.0 L16)*
- *Q:* What number is VASP minimizing, and when is comparing two of them meaningful?
- Topics: KS total energy and double counting; VASP energies are relative to the POTCAR atomic
  references; consistent settings; formation energies and reference states; convex hull and
  E_above_hull; mixing GGA and GGA+U (corrections); O₂ overbinding.
- Interactive: convex-hull builder for a binary A–B. Drag phases and the hull and E_above_hull
  update live; toggle a correction shift.
- VASP: TOTEN vs energy(sigma→0); pymatgen PhaseDiagram.
- Sources: Wang, Maxisch & Ceder, PRB 73, 195107 (2006); Jain et al., PRB 84, 045115 (2011);
  Wang et al., Sci. Rep. 11, 15496 (2021); V.

**L21 · Forces, stress and structural relaxation** · *(v1.0 L17)*
- *Q:* How can an electronic calculation produce forces, and what changes when ISIF changes?
- Topics: Hellmann–Feynman; Pulay terms (a plane-wave basis doesn't move with atoms; PAW
  on-site terms do); stress tensor and Pulay stress; optimizers (CG, quasi-Newton, damped MD,
  FIRE); ISIF table; EDIFFG sign convention; local vs global minima.
- Interactive: (a) optimizer race on a 2D model surface: steepest descent vs CG vs BFGS from the
  same start; (b) ISIF visualizer showing which degrees of freedom move.
- VASP: IBRION, ISIF, NSW, POTIM, EDIFFG; stress "in kB" and its sign convention (stated explicitly).
- Sources: Feynman, Phys. Rev. 56, 340 (1939); Nielsen & Martin, PRB 32, 3780 (1985); V.

**L22 · Equations of state and elastic constants** · *new*
- *Q:* How do I get a reliable lattice constant, bulk modulus, or elastic tensor?
- Topics: fixed-volume E(V) scans (avoid Pulay stress); third-order Birch–Murnaghan; B₀, B₀′;
  elastic constants from stress–strain; Voigt notation; Born stability criteria; comparing with
  experiment (temperature, zero-point).
- Interactive: E–V fitter. Paste your own data and get V₀, B₀, B₀′ with residuals. Strain explorer
  for cubic C₁₁, C₁₂, C₄₄.
- VASP: ISIF = 2 scans vs ISIF = 3; IBRION = 6 elastic tensor output.
- Sources: Birch, Phys. Rev. 71, 809 (1947); Mouhat & Coudert, PRB 90, 224104 (2014); V.

### Part VI — Spin, magnetism and correlated electrons

**L23 · Spin-polarized DFT and magnetism** · *(v1.0 L18)*
- *Q:* What does spin-polarized DFT solve differently, and why can MAGMOM change the answer?
- Topics: n↑, n↓, m; spin-DFT; exchange splitting; Stoner criterion; FM/AFM/ferri and supercells;
  multiple self-consistent solutions; local moments and the sphere caveat.
- Interactive: (a) Stoner model: DOS and I sliders give the self-consistent m and E(m);
  (b) "where does it land?": different starting MAGMOMs fall into different minima.
- VASP: ISPIN, MAGMOM, NUPDOWN, AMIX_MAG, BMIX_MAG; OSZICAR mag=; OUTCAR magnetization table.
- Sources: von Barth & Hedin, J. Phys. C 5, 1629 (1972); B ch. 9; Stoner, Proc. R. Soc. A 165, 372 (1938); V.

**L24 · Spin–orbit coupling and magnetic anisotropy** · *new*
- *Q:* Why does a magnet's energy depend on which way its moments point?
- Topics: scalar-relativistic vs SOC; noncollinear magnetism; spinors; magnetocrystalline
  anisotropy; MAE by self-consistent runs vs the force theorem; µeV-scale energies need strict
  convergence; orbital moments; 4f rare-earth magnets.
- Interactive: anisotropy energy surface E(θ, φ) for model K₁, K₂ on a sphere.
- VASP: LNONCOLLINEAR, LSORBIT, SAXIS, 3-component MAGMOM, LORBMOM, GGA_COMPAT, vasp_ncl.
- Sources: Hobbs, Kresse & Hafner, PRB 62, 11556 (2000); Steiner et al., PRB 93, 224425 (2016); V.

**L25 · Localized d and f electrons: self-interaction and DFT+U** · *(v1.0 L19)*
- *Q:* What does DFT+U correct, and why does the answer depend on U?
- Topics: self-interaction and delocalization error; exact E(N) is piecewise linear; Hubbard U;
  Dudarev (U_eff = U − J) vs Liechtenstein; occupation matrices; choosing U (linear response,
  fitted to formation enthalpies); pitfalls (energies at different U aren't comparable;
  metastable states); 4f options.
- Interactive: (a) E(N) between integers: exact (linear), semilocal (convex), HF (concave), with a
  U slider showing the correction (model); (b) Dudarev penalty (U_eff/2)·Σ n(1−n).
- VASP: LDAU, LDAUTYPE, LDAUL, LDAUU, LDAUJ, LMAXMIX, LDAUPRINT; Materials Project U values.
- Sources: Anisimov, Zaanen & Andersen, PRB 44, 943 (1991); DFT+U98; Liechtenstein et al.,
  PRB 52, R5467 (1995); Cococcioni & de Gironcoli, PRB 71, 035105 (2005); Perdew et al.,
  PRL 49, 1691 (1982); Mori-Sánchez, Cohen & Yang, PRL 100, 146401 (2008).

### Part VII — Beyond semilocal functionals

**L26 · Jacob's ladder and meta-GGAs: SCAN and r²SCAN** · *(v1.0 L21, part 1)*
- *Q:* What does the kinetic-energy density add, and is higher on the ladder always better?
- Topics: Jacob's ladder; τ and the iso-orbital indicator α; SCAN's exact constraints;
  r²SCAN's numerical stability; cost; where meta-GGAs help and where they don't (e.g. SCAN
  over-magnetizes itinerant ferromagnets).
- Interactive: α for model densities (single orbital → 0, UEG → 1, bond overlap → ≫1); ladder
  explorer with ingredients, cost, and VASP settings per rung.
- VASP: METAGGA = R2SCAN/SCAN, LASPH = .TRUE., LMIXTAU; POTCAR requirements.
- Sources: Perdew & Schmidt, AIP Conf. Proc. 577, 1 (2001); SCAN15; Furness et al., JPCL 11,
  8208 (2020); Kingsbury et al., Phys. Rev. Mater. 6, 013801 (2022); Fu & Singh, PRL 121, 207201 (2018)†.

**L27 · Hybrid functionals: exact exchange and HSE06** · *(v1.0 L20)*
- *Q:* Why is HSE so much more expensive than PBE, and what do you get for the cost?
- Topics: nonlocal, orbital-dependent exchange; PBE0 (a = ¼) rationale; range separation by erfc;
  HSE06 (screening ≈ 0.2 Å⁻¹, short-range a = ¼)†; cost scaling with k/q; practical tricks;
  what improves (sp gaps) and what doesn't (metals).
- Interactive: (a) 1/r = erfc(μr)/r + erf(μr)/r with a μ slider; (b) cost vs k-mesh (scaling
  labelled as illustrative).
- VASP: LHFCALC, HFSCREEN, AEXX, AGGAX, AGGAC, ALGO, NKRED, PRECFOCK.
- Sources: HSE (JCP 118, 8207 (2003); erratum JCP 124, 219906 (2006)); Krukau et al., JCP 125,
  224106 (2006); Perdew, Ernzerhof & Burke, JCP 105, 9982 (1996); Paier et al., JCP 124, 154709 (2006); V.

**L28 · Dispersion and van der Waals interactions** · *(v1.0 L21, part 2)*
- *Q:* Why does semilocal DFT miss what holds graphite layers and molecular crystals together?
- Topics: London dispersion as long-range correlation; −C₆/R⁶; pairwise corrections D2/D3/D4
  with zero vs BJ damping; nonlocal vdW-DF family (optB86b-vdW, rVV10); many-body dispersion
  (mention); choices for layered systems, molecular crystals, and adsorption.
- Interactive: binding curve of two fragments: model semilocal curve plus D3-type correction,
  zero vs BJ damping (formulas real, system labelled as a model).
- VASP: IVDW, VDW_* parameters, LUSE_VDW, GGA = MK/BO with PARAM1/PARAM2, r²SCAN+rVV10.
- Sources: Grimme, J. Comput. Chem. 27, 1787 (2006); Grimme et al., JCP 132, 154104 (2010);
  Grimme, Ehrlich & Goerigk, J. Comput. Chem. 32, 1456 (2011); Dion et al., PRL 92, 246401 (2004);
  Klimeš, Bowler & Michaelides, PRB 83, 195131 (2011); Sabatini et al., PRB 87, 041108 (2013).
- ◆ **Milestone IV:** compare PBE, DFT+U, r²SCAN, vdW-corrected DFT, and HSE by approximation,
  cost, and failure modes.

### Part VIII — Reading electronic structure

**L29 · Band structures, DOS and projected DOS** · *(v1.0 L22)*
- *Q:* What can, and can't, be concluded from a band structure?
- Topics: KS eigenvalues as approximate band energies; SCF → non-SCF workflow (ICHARG = 11);
  k-path conventions; DOS and van Hove singularities; projections and their sphere dependence;
  spin-resolved DOS; charge density, PARCHG, ELF, and Bader (brief).
- Interactive: 2D tight binding with linked band structure (Γ–X–M–Γ), DOS, and BZ constant-energy
  contour. Hover one and the others follow; the van Hove peak sits at the saddle point.
- VASP: ICHARG, LORBIT, NEDOS, EMIN/EMAX, NBANDS; EIGENVAL, DOSCAR, PROCAR; tools (pymatgen, sumo,
  seekpath).
- Sources: Setyawan & Curtarolo 2010; Hinuma et al., Comput. Mater. Sci. 128, 140 (2017);
  Henkelman, Arnaldsson & Jónsson, Comput. Mater. Sci. 36, 354 (2006); Becke & Edgecombe,
  JCP 92, 5397 (1990); V.

**L30 · The band-gap problem** · *(v1.0 L23)*
- *Q:* Why is "PBE underestimates band gaps" an incomplete explanation?
- Topics: fundamental gap I − A; KS gap; derivative discontinuity (E_g = E_g^KS + Δ_xc);
  delocalization error; generalized KS (hybrids); quasiparticle (GW) vs optical (excitons) gaps;
  comparing with experiment (temperature, zero-point renormalization).
- Interactive: E(N) curve. Drag N between integers to see the exact slope jump (−I to −A) vs a
  convex semilocal curve; a sourced table of PBE/HSE/experimental gaps.
- VASP: PBE vs HSE gaps; GW and BSE (mention).
- Sources: Perdew, Parr, Levy & Balduz, PRL 49, 1691 (1982); Perdew & Levy, PRL 51, 1884 (1983);
  Sham & Schlüter, PRL 51, 1888 (1983); Hybertsen & Louie, PRB 34, 5390 (1986); Heyd et al.,
  JCP 123, 174101 (2005); Perdew et al., PNAS 114, 2801 (2017); B ch. 14.

### Part IX — From energies and forces to materials properties

**L31 · Phonons and dynamical stability** · *(v1.0 L26, part)*
- *Q:* How do second derivatives of the energy become vibrational spectra, and what does an
  imaginary mode mean?
- Topics: harmonic approximation; force constants; dynamical matrix; acoustic/optical branches;
  finite displacement (phonopy) vs DFPT; supercell and k convergence; tight EDIFF; imaginary
  modes; LO–TO splitting; quasi-harmonic thermodynamics (brief).
- Interactive: diatomic chain with mass-ratio and spring sliders; click q to animate the mode;
  finite-displacement demo showing supercell truncation error.
- VASP: IBRION = 5/6 and 7/8, POTIM, NFREE, LEPSILON; phonopy workflow.
- Sources: Togo & Tanaka, Scr. Mater. 108, 1 (2015); Baroni et al., Rev. Mod. Phys. 73, 515 (2001);
  Ashcroft & Mermin chs. 22–23; S L19.

**L32 · Transition states and the nudged elastic band** · *(v1.0 L26, part)*
- *Q:* How do we find the barrier for an atom, or a proton, to hop?
- Topics: minimum-energy path; saddle points; NEB force projection; climbing image; number of
  images; initial paths (linear, IDPP); dimer method (mention); harmonic transition-state theory.
- Interactive: NEB on the Müller–Brown surface. Set the images and spring constant, toggle the
  climbing image, and watch the band relax onto the path while the barrier converges to the known
  saddle point.
- VASP: IMAGES, SPRING, IBRION = 3 + POTIM = 0 with IOPT, LCLIMB, ICHAIN (VTST).
- Sources: Henkelman, Uberuaga & Jónsson, JCP 113, 9901 (2000); Henkelman & Jónsson, JCP 113,
  9978 (2000); Müller & Brown, Theor. Chim. Acta 53, 75 (1979); Smidstrup et al., JCP 140,
  214106 (2014).

**L33 · Ab initio molecular dynamics** · *(v1.0 L26, part)*
- *Q:* How do DFT forces drive atoms in time, and how do I know my MD is trustworthy?
- Topics: Born–Oppenheimer MD; velocity Verlet; timestep and energy conservation; NVE/NVT/NpT;
  thermostats; equilibration and statistics; diffusion from MSD.
- Interactive: MD on a 2D model surface: the timestep slider shows energy drift; thermostat
  on/off; live MSD.
- VASP: IBRION = 0, POTIM, MDALGO, TEBEG/TEEND, SMASS, LANGEVIN_GAMMA, XDATCAR.
- Sources: Frenkel & Smit, *Understanding Molecular Simulation*; Nosé, JCP 81, 511 (1984);
  Hoover, PRA 31, 1695 (1985); Marx & Hutter, *Ab Initio Molecular Dynamics*; V.

**L34 · From DFT data to machine-learning interatomic potentials** · *(v1.0 L27)*
- *Q:* How can DFT data train a fast potential, and which DFT errors does it inherit?
- Topics: the map {R} → E; locality and descriptors; equivariant GNNs; energy/force/stress
  losses; training-set design; active learning and on-the-fly MLFF; universal MLIPs trained on
  PBE/PBE+U data inherit those errors; systematic softening; validation beyond force RMSE.
- Interactive: Gaussian-process fit to a 1D model surface from N training points. Interpolation
  works and extrapolation fails; the uncertainty band chooses the next point (active learning).
- VASP: ML_LMLFF, ML_MODE; exporting VASP data for training.
- Sources: Behler & Parrinello, PRL 98, 146401 (2007); Bartók et al., PRL 104, 136403 (2010);
  Jinnouchi, Karsai & Kresse, PRB 100, 014105 (2019); Deng et al., Nat. Mach. Intell. 5, 1031
  (2023); Batatia et al., MACE (NeurIPS 2022); Deng et al., npj Comput. Mater. (2025) on softening†.

### Part X — Doing DFT responsibly

**L35 · Convergence is not correctness: an error taxonomy** · *(v1.0 L24)*
- *Q:* What kind of error am I reducing when I converge a calculation?
- Topics: numerical error (ENCUT, k, SCF tolerance, smearing, FFT, supercell, relaxation
  tolerance); functional/model error (xc, U, dispersion); physical-model error (magnetic order,
  charge state, temperature, SOC, configurational sampling, finite size); error cancellation in
  energy differences.
- Interactive: triage game. Sort ~15 short scenarios into numerical / functional / physical-model,
  with an explanation and a lecture link for each.
- Sources: Lejaeghere et al., Science 351, aad3000 (2016); Bosoni et al., Nat. Rev. Phys. 6, 45 (2024); V.

**L36 · Designing and defending a DFT methodology** · *(v1.0 L25)*
- *Q:* How do I choose, justify, and report a methodology that survives peer review?
- Topics: v1.0's 12-point design checklist; reporting standards (code version, POTCAR labels,
  all relevant tags, convergence evidence); data sharing (NOMAD, Materials Cloud, MP, MMI Data Hub).
- Interactive: methods-paragraph builder. Choose options and get a draft paragraph that flags every
  unjustified choice.
- Sources: Lejaeghere 2016; Draxl & Scheffler, J. Phys. Mater. 2, 036001 (2019); V.
- ◆ **Milestone V:** design, critique, and defend a DFT methodology for a real problem.

**Capstone · Audit one real VASP study** *(v1.0 §5, unchanged)*. Annotated INCAR/KPOINTS, PAW
justification, convergence summary, magnetic-state audit, xc justification, limitations paragraph,
methods paragraph. Template page plus downloadable checklist.

## 9. Reference pages (not numbered lectures)

- **Math toolkit:** T1 complex numbers and phase · T2 vectors, matrices, eigenproblems ·
  T3 calculus in 3D (∇, ∇², volume integrals) · T4 Fourier series and transforms ·
  T5 units (Hartree atomic units, eV, Å, Ry, kbar) · T6 running VASP on a cluster (SLURM, NCORE, KPAR).
- **Glossary** (`/dft/glossary/`, aimed at "what is …" searches) · **VASP tag index**
  (`/dft/vasp-tags/`, aimed at "INCAR tags explained" searches) · **References** · **Errata**. All of
  these are generated from `terms.json`, the same data the popups use.

## 10. Build order and per-lecture workflow

- **Phase 0:** framework (dft.css, deck.js, num.js + tests, terms.json, course.json,
  build_dft.mjs with KaTeX pre-render and JSON-LD, sitemap lastmod), course home, and L0, which
  exercises every slide and popup type.
- **Phase 1:** L1–L3, converted from the existing Drive notes (content already settled), to test the
  format.
- **Phase 2:** L4 onward, one lecture at a time. Update the main-site "Learn with me" card and the
  dropdown once L0–L3 are live.

**Checks per lecture:** every DOI is verified against Crossref (title, authors, volume, page);
pages are exercised in headless Chrome (popovers, equation legends, figures, presentation mode, no
console errors, no horizontal scroll at 390 px) and screenshotted at desktop and phone widths.

**Per-lecture loop:** read the sources → slide outline + demos + sources for your OK → write →
numerics tests → independent fact-check → your first-student pass → fixes → commit, publish,
request indexing.

## 11. Notes on the existing Drive material

- v1.0 targets "a researcher who can already run basic VASP"; for from-scratch students it lacks
  atomic orbitals, LDA itself, Thomas–Fermi, practical inputs and convergence, EOS, and SOC (added above).
- v1.0's source list lacks the VASP method papers (Kresse & Hafner, PRB 47, 558 (1993);
  Kresse & Furthmüller 1996), the k-point and smearing papers, and undergraduate texts. The folder
  plan lists Sholl & Steckel and Martin, but no lesson cites them.
- MIT 5.61 lecture numbers disagree: the curriculum gives the variational principle as L20, while
  the Lecture 3 notes cite L24 (Fall 2017). Pin one term (Fall 2017) for all citations.
- v1.0 Lesson 17 writes σ = (1/Ω)∂E/∂ε with no sign convention; VASP's printed pressure sign must
  be stated explicitly in L21.
- Math in Lectures 1–3 spot-checked and correct: HO variational minimum ħω/2 at α = mω/ħ; 2×2
  eigenvalues 0.9615 and 2.0385 eV; default ENCUT = largest ENMAX. The garbled equations in the
  PDF text are a rendering artefact only.

## 12. Part I build log (v2 format)

User request, 2026-10-30 02:45: "now similarly do for the rest of the lectures of part 1. if token
out, please continue at 5am again." A one-shot resume was scheduled for 05:03 (session-only).

**Per-lecture loop:** read the sources (MIT 5.61 F17 notes are saved as text in the session
scratchpad `p1/txt/`; the user's Drive notes for L2 and L3 were recovered to `drive/`) → write
`dft/_src/<slug>.html` in the §5 grammar and `dft/figs/<slug>.js` with `snapshots` → add terms,
tags and refs to `terms.json` and set the course.json entry to "published" (description, dates,
minutes, prereq, outcomes, teaches) → `node scripts/build_dft.mjs` → add the figure numerics to
`scripts/test_dft.mjs` → `node scripts/check_dft_refs.mjs` → fit test in the scratchpad
(`node fit.mjs <outDir> <slug> --shots`, then `node sheet.mjs` for contact sheets) → one
independent fact-check agent → apply verified findings → update this log.

| Lecture | Status |
| --- | --- |
| L1 Born–Oppenheimer | Done (v2), two fact-checks applied |
| L2 Wavefunctions, operators, eigenvalues | Done: fact-check (13 findings) applied |
| L3 Variational principle and basis sets | Done: fact-check (11 findings) applied |
| L4 Atomic orbitals, core and valence | Done: fact-check (12 findings) applied |
| L5 Pauli exclusion and Slater determinants | Done: fact-check (17 findings) applied |
| L6 Hartree–Fock | Done: fact-check (13 findings) applied; helium HF solved in the browser, checked against Hatano & Yamamoto 2020 |

**Textbook-voice revision (§5.4), started 2026-10-30 after the user's feedback.** L6 is the pilot:
inline citations removed; new slides on where exchange comes from, helium by hand (E = 2h + J,
ζ = 27/16), the Roothaan–Hall equations, and double counting (EBANDS, DENC, XCENC); derivations in
"Going deeper" blocks; the chart now compares with the exact nonrelativistic energy −2.903724 Ha.
User, same day: "I told about all lectures, not only lecture 6." L0–L5 were then revised the same way:
0 inline citations and 0 quotations in all seven lectures (there were 185 chips and 4 quotes); notes
about 35% longer, with new derivations (Kohn–Sham equations, Hellmann–Feynman force as an electrostatic
force, BO expansion and nonadiabatic coupling, particle-in-a-box solution, Hermitian proofs, Rayleigh
quotient → Hc = ESc, effective radial potential, 5Z/8 for helium) and worked numbers. Every lecture has a
"reading" list in course.json, provenance comments at the top of its source, passing tests and fit tests.
The home page now says "Self-contained" instead of "Every claim sourced". Old versions backed up in the
session scratchpad (v2-backup/).

Part I finished 2026-10-30 ~03:50. Every lecture: built, Node tests pass, DOIs match Crossref, no frame overflows (1280×720, 1440×900, 1920×1080, page and present), no console errors, no horizontal scroll at 390 px. Next: Part II (L7 onward) when the user asks; the user's lab outputs for Labs 0–6.

**Launch, 2026-10-30.** Linked from the site: home-page menu ("DFT and VASP course") and a "Learn with me"
card with links to Lectures 0–6 (image assets/fig/learn-dft.webp); cross-links between the course home and
the symmetry guide. SEO pass: every description at most 160 characters; meta keywords and JSON-LD
`keywords` from course.json (hyphenated spellings, as people search); og:image:alt, og:locale and article
dates; robots.txt keeps /dft/_src/ and this plan out of search. Internal link check: 0 broken across 241
pages; all external links answer except LinkedIn and SSRN, which block bots.
