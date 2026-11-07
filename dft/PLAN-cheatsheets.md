# VASP cheat sheets — plan (v1.0 draft, 2026-11-06)

Companion to `dft/PLAN.md`. The course teaches *why*; the cheat sheets are the *what to type, how to
check it, what goes wrong* reference that a working researcher keeps open beside the terminal.
Research notes, parser sources and public VASP test outputs are in `dft/_research/` (git-ignored,
local only):
- research briefs, one per group, every fact with its source address and anything unconfirmed
  marked UNVERIFIED:
  - `part1-landscape.md`: search landscape and SEO;
  - `A2-incar.md`: INCAR;
  - `part3-kpoints-part5-poscar.md`: KPOINTS and POSCAR;
  - `part4-potcar.md`: POTCAR;
  - `B-slurm-output-debug.md`: reading output, errors, Slurm;
  - `C-magnetism-relaxation.md`: magnetism and relaxation;
  - `D-neb-aimd.md`: NEB, AIMD and MLFF;
  - `E-properties.md`: properties;
- `fetched-*.md`: the raw page extracts behind the briefs (provenance);
- `parsers/` (pymatgen, ASE, py4vasp and custodian source), `testfiles/` (19 real VASP outputs) and
  `wiki-cache/`.

## 1. Who it is for and what makes it different

- **Reader:** anyone running VASP, from a first calculation to daily production work (magnets,
  r²SCAN, phonons, NEB, MD). One set of sheets, no level split.
- **Organized by task, not alphabetically.** Each sheet answers four questions in order:
  *what do I set* → *why* (one line, with a link to the lecture that explains it) → *how do I check
  that it worked* → *what usually goes wrong*.
- **Expert judgment made explicit.** Every recommendation carries one of four labels instead of a
  citation:
  - **VASP default**: what you get if the tag is omitted.
  - **VASP advice**: the developers' own recommendation.
  - **Rule of thumb**: community practice; sensible, but check it for your system.
  - **Needs VTST** / **Since 6.x**: needs the VTST patch, or a minimum VASP version.
- **Same voice as the lectures:** no inline citations. Provenance goes in an HTML comment at the
  top of each source file, and a short "Further reading" list closes each sheet. Tag names link to
  their VASP Wiki page, which is a reference link, not a citation.

## 2. What the research found (shapes everything below)

1. **"VASP cheat sheet" is a crypto search.** Most top results are about Virtual Asset Service
   Providers. Every title must therefore say *VASP INCAR*, *VASP KPOINTS*, *VASP NEB* and so on; a
   bare "VASP cheat sheet" won't rank.
2. **No current, self-contained VASP cheat sheet ranks for any of 12 target searches.** What ranks
   instead:
   - 2009 manual mirrors that still use NPAR and LPLANE;
   - VASP 5.4.4-era HPC pages and gists with wrong comments;
   - dead or hijacked domains, PDFs and Scribd uploads;
   - the VASP Wiki. It is authoritative but fragmented: one page per tag plus 98 how-to pages, and
     its only "cheat sheet" covers restart files. Its best POTCAR page doesn't rank for "which
     POTCAR to use", and old revisions and mirror hosts split its ranking.
   - The VASP forum, for error searches. The top ZBRENT thread is from 2007, and a 2026 developer
     note that the IBRION=2 bracketing bug is fixed in 6.6 is buried.
3. **The current release is VASP 6.6.1.** It is a patch for 6.6.0, which gave wrong forces in
   spin-polarized meta-GGA runs (Known issue 94). That covers spin-polarized r²SCAN relaxations,
   NEB, MD and MLFF training run on 6.6.0. The sheets carry a visible "Checked against VASP 6.6.1"
   stamp, which none of the competitors have.
4. **Facts that bite, already confirmed:**
   - *KSPACING* gives N_i = max(1, ⌈|b_i|·2π/KSPACING⌉). "Auto" mode rounds to the nearest
     integer instead of taking the ceiling. pymatgen's k-point density floors instead of ceiling.
   - *Lattice rules:* use only Γ-centred meshes for fcc and rhombohedral lattices; avoid
     Monkhorst–Pack meshes with even in-plane subdivisions for hexagonal ones.
   - *f-in-core potentials* (`Nd_3`, `Sm_3`) contain no 4f moment. Valence-f lanthanides should
     come from potpaw.64. Materials Project Gd energies use a POTCAR that VASP does not distribute,
     so your energies can't be compared with theirs.
   - *Climbing image:* stock VASP still has none. Under VTST, `LCLIMB` defaults to `.TRUE.`.
   - *MD thermostats:* every coupling tag defaults to an NVE value, so a run that sets only
     MDALGO silently runs NVE. MDALGO=0 wraps coordinates, which breaks the mean-square
     displacement (MSD).
   - *MLFF:* since 6.6.0 the spilling factor is always on, and a run stops if it exceeds 0.9.
   - *ISIF = 8*, a new relaxation mode, exists only from VASP 6.4.1. GGA_COMPAT = .FALSE. is
     recommended for noncollinear runs.
   - *Electron–phonon coupling is now native* (the ELPH_* tags). Implicit solvation still needs
     the external VASPsol patch; the research found no native LSOL page.
   - *The IBRION = 2 bracketing (ZBRENT) fix* is dated differently by two sources: the 6.5.0
     changelog, and a 2026 developer post saying 6.6. Resolve this on the Errors sheet.
   - *IBRION's default is a trap:* with NSW > 0 it switches to molecular dynamics, which has no
     default time step, so VASP stops at once.
   - *`grep TOTEN` matches every SCF step;* only `free  energy   TOTEN` (two spaces) is the
     summary for each ionic step.
   - *Full cell relaxations:* for ISIF = 3 the EDIFFG test also covers the stress. A VASP developer
     stated this; the Wiki does not document it.
   - *r²SCAN limits:* no LEPSILON and no DFPT phonons (IBRION = 7/8); use LCALCEPS and IBRION = 6.
     Before 6.6.0 there were no r²SCAN LOPTICS and no ICHARG = 11 band structures (use
     KPOINTS_OPT instead).
   - *Elastic tensor:* VASP prints the columns as XX YY ZZ XY YZ ZX, so columns 4 and 6 must be
     swapped to get standard Voigt order.
   - *Slurm `afterok` checks only the exit code,* not convergence, so a relax → static chain
     needs its own convergence guard.
   - *Materials Project choices differ from VASP's advice:* metals are relaxed with ISMEAR = −5,
     there is no force criterion (EDIFFG), and the newest sets use `_h` lanthanides. The sheets
     show these choices as a reference, not as the recommendation.
   - *Source conflicts to settle when writing:* the PSTRESS sign, ISPIN = 2 with LNONCOLLINEAR,
     the LATTICE_CONSTRAINTS version, the MAXMIX default (45 or −45), and the r²SCAN minimum
     version.
5. **Interactive tools nobody offers on the web:**
   - an INCAR builder by situation;
   - a KSPACING-to-mesh calculator;
   - a MAGMOM pattern builder;
   - a "paste your error" lookup.

   The only interactive aids that exist are editor plug-ins (VASP's VS Code extension, VASP-LSP).

## 3. Site structure and URLs

The cheat sheets sit inside the course, so they share its look and its INCAR tag list (`terms.json`),
which feeds the popups.

```
dft/
  cheatsheets.json          registry: slug, title, H1, description (≤160), keywords, group,
                            status, dates, vaspChecked, related lectures, reading
  _cheat/<slug>.html        sheet sources (provenance comment at top; robots-disallowed)
  vasp-cheat-sheets/        GENERATED hub page
  vasp-cheat-sheets/<slug>/ GENERATED sheets
  cheat.js                  copy buttons, filters, search, tool UIs
  cheat-tools.js            pure logic for the tools (no DOM), tested under Node
  terms.json                tag registry, extended: since-version, VTST flag, sheet anchor
scripts/build_dft.mjs       + cheatHome(), cheatPage(); same head/JSON-LD/breadcrumbs as lectures
scripts/test_cheat.mjs      tool logic + shell one-liners run against real output files
```

| Group | Sheet | URL `/dft/vasp-cheat-sheets/…/` | `<title>` | Research |
| --- | --- | --- | --- | --- |
| Hub | All sheets | *(hub)* | VASP Cheat Sheets: INCAR, KPOINTS, POTCAR, Slurm | done |
| Essentials | INCAR | `incar-tags` | VASP INCAR Cheat Sheet: Tags, Defaults and Recipes | done |
| Essentials | KPOINTS | `kpoints` | VASP KPOINTS: Gamma, Monkhorst-Pack, KSPACING, Bands | done |
| Essentials | POTCAR | `potcar` | Which POTCAR to Use in VASP: _pv, _sv, _3 Explained | done |
| Essentials | POSCAR *(added)* | `poscar` | VASP POSCAR Format: Selective Dynamics, Direct vs Cartesian | done |
| Essentials | Slurm job script | `slurm-job-script` | VASP Slurm Job Script: srun, NCORE, KPAR, GPU | done |
| Essentials | Reading output | `outcar-oszicar-grep` | Read VASP Output: grep OUTCAR and OSZICAR | done |
| Essentials | Errors and fixes | `errors-and-fixes` | VASP Errors and Fixes: ZBRENT, EDDDAV, BRMIX, SGRCON | done |
| Applications | Relaxation | `relaxation-workflow` | VASP Relaxation Workflow: IBRION, ISIF, Relax to Static | done |
| Applications | Magnetism | `magnetism-magmom` | VASP Magnetism: MAGMOM, AFM, NUPDOWN, SOC and DFT+U | done |
| Applications | Properties | `properties` | What Can VASP Calculate? Properties and How to Get Them | done |
| Applications | NEB | `neb` | VASP NEB Cheat Sheet: IMAGES, Climbing Image, VTST | done |
| Applications | AIMD + MLFF | `aimd-mlff` | VASP AIMD Cheat Sheet: MDALGO, NVT, NpT and ML Force Fields | done |

- **No overlap with the lectures in search.** The lectures target *explained/theory* searches
  (`/dft/nudged-elastic-band/`); the sheets target *cheat sheet/recipe/how-to* searches
  (`/dft/vasp-cheat-sheets/neb/`). Each links to the other.

## 4. The hub page (`/dft/vasp-cheat-sheets/`)

```
┌──────────────────────────────────────────────────────────────────────┐
│ Osman Goni Ridwan › DFT & VASP Course › VASP cheat sheets            │
│ H1  VASP Cheat Sheets                                                │
│ Inputs, job scripts, output, errors and research workflows for VASP  │
│ 6. Checked against VASP 6.6.1 · updated <date>                       │
│ [ Search tags, commands, error messages … ]                          │
│                                                                      │
│ START FROM YOUR TASK                                                 │
│  I want to relax a structure → Relaxation · My SCF won't converge →  │
│  Errors#scf · Set up an antiferromagnet → Magnetism#afm · …          │
│                                                                      │
│ THE WORKFLOW MAP (each box links to its sheet)                       │
│  POSCAR → POTCAR · KPOINTS · INCAR → Slurm → read output → fix       │
│     └→ relax → static → DOS/bands/properties                         │
│     └→ magnetism · NEB · AIMD/MLFF                                   │
│                                                                      │
│ ESSENTIALS   [INCAR][KPOINTS][POTCAR][POSCAR][Slurm][Output][Errors] │
│ APPLICATIONS [Relaxation][Magnetism][Properties][NEB][AIMD + MLFF]   │
│   card = title · what it answers · 3 sample tags · tool badge        │
│                                                                      │
│ INCAR TAG INDEX A–Z (from terms.json: tag · meaning · default ·      │
│   sheet · lecture)  — doubles as the "VASP tag index" planned in     │
│   PLAN.md §9                                                         │
│ How the sheets are checked · Corrections · Link to the course        │
└──────────────────────────────────────────────────────────────────────┘
```

Unbuilt sheets are listed without links, so no thin pages get indexed. The hub goes live with the
first published sheet.

## 5. Sheet page design (reference pages, not slides)

- **Top:** H1, a one-line purpose, the version stamp, a Print button, and a sticky table of contents
  (a drawer on phones).
- **"The short version" box:** the five lines you would scribble on a sticky note.
- **Body cards:** tables, copy-ready blocks, decision trees and checks.
  - Every code block has a copy button, and its comments explain each line.
  - Tables turn into stacked cards on phones; code scrolls inside its own block, never the page.
- **Decision trees** as small HTML/SVG flowcharts. Examples:
  - "metal or insulator → ISMEAR/SIGMA";
  - "which IBRION";
  - "SCF not converging → try in this order".
- **"Check it worked"** after every recipe: the exact command and what a good result looks like.
- **"Common mistakes"** as a short list, each with the symptom you would see.
- **End:** related lectures, then Further reading (three to five VASP Wiki or VTST pages).
- **Print stylesheet:** two to four pages, two columns, no navigation. The printed page is the
  classic one-page cheat sheet.
- **Error strings** each get their own `<h3>` with a stable `id`, e.g.
  `#zbrent-fatal-error-in-bracketing`, for deep links and search snippets.

## 6. Contents of each sheet

### Essentials

**E1 · INCAR** (`incar-tags`)
- *Tags to set yourself in every run:*
  - PREC, ENCUT, EDIFF, ISMEAR/SIGMA, ALGO, NELM;
  - IBRION/ISIF/NSW/EDIFFG/POTIM for relaxations;
  - ISPIN/MAGMOM;
  - LWAVE/LCHARG/LORBIT;
  - NCORE/KPAR.
- *Defaults that bite:*
  - IBRION with NSW > 0 defaults to MD, which stops VASP at once;
  - ISMEAR=1 is wrong for insulators;
  - ENCUT defaults to the largest ENMAX, which is too low for volume relaxations;
  - LREAL;
  - NBANDS for antiferromagnets before 6.6;
  - the restart-file defaults that changed in 6.x (LCHARG, LH5).
- *Tag table by group:* start and restart (ISTART, ICHARG); precision and basis; electronic;
  ionic; spin; output; functional (GGA, METAGGA, LASPH); parallel; symmetry; KSPACING/KGAMMA.
- *Recipes by task, each a commented INCAR:*
  - static (insulator) and static (metal);
  - relaxation;
  - DOS and band structure;
  - spin-polarized;
  - r²SCAN;
  - HSE06.

  The Materials Project input sets are shown as a high-throughput reference point.
- *Tool:* **INCAR builder**. Choose the task, metal/insulator, spin and functional, and it writes an
  annotated INCAR. It also lints for conflicts, e.g. LSORBIT without vasp_ncl, ISMEAR=−5 in a
  relaxation, or IBRION=3 with POTIM=0 without VTST.

**E2 · KPOINTS** (`kpoints`)
- Every format:
  - fully automatic;
  - Γ-centred and Monkhorst–Pack;
  - explicit list with weights;
  - line mode;
  - KSPACING as an INCAR alternative.
- The exact formulas: Γ vs MP grids, KSPACING, Auto. Also the pymatgen k-point density converted
  to the KSPACING scale, e.g. reciprocal density 64 ≈ 0.25 Å⁻¹.
- A table of which mesh suits which lattice, including the hexagonal 1/3 shift and the body-centred
  tetragonal caveat. Rare-earth magnet prototypes as worked examples.
- Band structures: line mode, KPOINTS_OPT, zero-weight k-points for hybrids, path tools.
- A convergence protocol: compare by the number of irreducible k-points (IBZKPT), not by N.
- *Tool:* **k-mesh calculator**. Paste a POSCAR, choose a KSPACING or density, and get the grid,
  Γ/MP advice and warnings.

**E3 · POTCAR** (`potcar`)
- What the suffixes mean: `_pv`, `_sv`, `_d`, `_h`, `_s`, `_GW`, `_2`/`_3`.
- The potential sets 54 vs 64 and what changed. The VASP recommended list is linked, not copied.
- How to build one: concatenate in the POSCAR species order.
- How to inspect one without printing it: `grep TITEL`, ZVAL, ENMAX, `kinetic` for meta-GGA,
  SHA256.
- Why the default ENCUT equals the largest ENMAX.
- Rules for comparing energies: the same POTCARs, and Materials Project-compatible only if the
  files are identical.
- The rare-earth 4f decision: f-in-core vs valence-f, with LMAXMIX=6 and LASPH.
- What to report in a methods section.
- *Tool:* **POTCAR command generator**. Give the POSCAR species and it writes the build and check
  commands. It never displays file contents.

**E4 · POSCAR** *(added: half of all first-run failures start here)* (`poscar`)
- The format line by line:
  - the scaling factor (negative means volume; VASP 6 also accepts three values);
  - the species line;
  - Selective dynamics;
  - Direct vs Cartesian;
  - the velocities block.
- Reusing CONTCAR, and common mistakes.
- *Tool:* **POSCAR checker**. It counts atoms, matches species, and computes the volume and the
  shortest interatomic distance, with warnings.

**E5 · Slurm job script** (`slurm-job-script`)
- *Templates:* a CPU script and a GPU (OpenACC) script, with every line commented.
- *Parallel layout:*
  - ranks vs threads;
  - NCORE vs OMP_NUM_THREADS, and the GPU rule (NCORE=1, KPAR for GPUs);
  - KPAR must divide the rank count;
  - srun vs mpirun;
  - vasp_std, vasp_gam and vasp_ncl.
- *Running jobs:*
  - chaining relax → static with `--dependency=afterok`, plus a convergence check, since afterok
    sees only the exit code;
  - job arrays for screening;
  - STOPCAR (LSTOP/LABORT) before the walltime ends, triggered by Slurm's `--signal`;
  - monitoring with squeue, sacct, seff and scontrol.
- *Tool:* **script generator**. Choose nodes, cores, GPUs, walltime and the binary; it suggests
  NCORE and KPAR and checks divisibility. The output is general and works on any Slurm cluster:
  site-specific lines (partition, account, module names) are marked as placeholders to fill in.

**E6 · Reading output** (`outcar-oszicar-grep`)
- *Map of the files* VASP writes and what each holds: OUTCAR, OSZICAR, CONTCAR, vasprun.xml,
  EIGENVAL, DOSCAR, PROCAR, CHGCAR, WAVECAR, XDATCAR, IBZKPT, REPORT, vaspout.h5.
- *One-liners by question:*
  - final energy, and which energy to report;
  - did it converge;
  - maximum force; pressure and stress;
  - E-fermi and the band gap;
  - magnetic moments;
  - SCF steps per ionic step;
  - timing; warnings.
- *The OSZICAR columns explained*, for both relaxation and MD lines. Python equivalents in py4vasp,
  pymatgen and ASE.
- *Tools:* a **command picker**, plus **"paste your OSZICAR"**, which plots the energy and dE per
  step in the browser. Nothing is uploaded.

**E7 · Errors and fixes** (`errors-and-fixes`)
- *Errors, one per exact string:* cause → fix → label.
  - ZBRENT, EDDDAV/ZHEGV, EDDRMM;
  - BRMIX, "Sub-Space-Matrix is not hermitian";
  - too few bands;
  - PRICEL, SGRCON, Bravais-lattice and IBZKPT/k-lattice class errors;
  - ZPOTRF, PSSYEVX, RSPHER, POSMAP, REAL_OPTLAY;
  - ions too close.
- *Flowcharts* for behaviour rather than error messages:
  - SCF won't converge;
  - relaxation oscillates;
  - magnetic moment collapses;
  - job dies (memory, stack, ranks, walltime).
- Where useful, what the custodian package fixes automatically.
- *Tool:* **paste-your-error lookup**.

### Applications

**A1 · Relaxation workflow** (`relaxation-workflow`)
- *Tables:* IBRION values; ISIF (which of positions, shape and volume relax); EDIFFG sign; POTIM
  per optimizer.
- *Pulay stress:* ENCUT ≈ 1.3 × ENMAX, and re-relaxing until the volume is stable.
- *The staged chain*, each step with its INCAR and the files it carries over:
  1. pre-relax (an ML potential or coarse settings);
  2. relax;
  3. re-relax;
  4. static;
  5. DOS and band structure, non-self-consistent.
- *Special cases:* slabs with selective dynamics; E–V curves at fixed volume; 2D materials.
- *Check commands:* forces, stress, "reached required accuracy", symmetry kept.

**A2 · Magnetism** (`magnetism-magmom`)
- *Basics:* ISPIN, MAGMOM syntax (`N*value`, order follows POSCAR) and NUPDOWN.
- *Orderings:*
  - FM, AFM and ferrimagnetic patterns, and when AFM needs a supercell;
  - how MAGMOM changes the symmetry VASP detects;
  - finding the ground state (enumerate orderings, compare energies).
- *Reading moments:* LORBIT=11 and the "magnetization (x)" block, and what the RWIGS spheres miss.
- *Noncollinear and spin–orbit:* three MAGMOM components per atom, SAXIS, and the magnetic
  anisotropy energy workflow (collinear charge density, then SOC runs along different axes).
- *Advanced:* constrained moments, spin spirals, and exchange constants J from energy mapping.
- *DFT+U:* LDAU tags, LMAXMIX, metastable states.
- *Convergence:* magnetic SCF tips (AMIX_MAG/BMIX_MAG).
- *Rare-earth magnets:* the 4f choice.
- *Tool:* **MAGMOM builder**. Paste a POSCAR, choose FM, AFM by sublattice, or custom, and get
  the compressed MAGMOM line, or three-component vectors for ncl runs.

**A3 · Properties: what can VASP calculate?** (`properties`)
- *A lookup table:* property → required tags → earlier steps needed → output file → analysis tool →
  native or external → cost. Its groups:
  - energetics: formation energy and hull, surfaces, adsorption, charged defects;
  - mechanics: EOS, elastic constants;
  - electronic: DOS/PDOS, bands, effective mass, work function, Bader, ELF, COHP (LOBSTER), STM,
    Wannier;
  - beyond GGA: HSE, GW, BSE, RPA;
  - optical and dielectric: LOPTICS, LEPSILON, Born charges, piezoelectric tensor;
  - vibrational: phonons via IBRION 5–8 or phonopy, IR, Raman, QHA, thermal conductivity;
  - spectroscopy: NMR, EFG, hyperfine, core levels, XAS;
  - fields and environment: polarization, electric fields, solvation;
  - transport, electron–phonon, free energies.
- *A functional-compatibility table:* which methods work with GGA, r²SCAN and hybrids, and
  since which version.
- *Ten to fourteen full recipes* for the most-used rows: DOS/PDOS, bands, Bader, ELF, work
  function, optics, dielectric/Born charges, elastic constants, phonons, COHP, HSE gap, formation
  energy, surface energy, adsorption energy.

**A4 · NEB** (`neb`)
- *Tags:* stock VASP (IMAGES, SPRING, folders 00…N+1, ranks as a multiple of IMAGES; use IBRION
  1 or 3, not 2) vs VTST (LCLIMB, IOPT optimizers with IBRION=3 and POTIM=0, solid-state NEB,
  dimer).
- *The expert workflow:*
  1. endpoints relaxed with identical settings;
  2. check the atom order;
  3. IDPP interpolation;
  4. inspect the images;
  5. plain NEB;
  6. CI-NEB;
  7. confirm the saddle point (one imaginary mode).
- *Supporting material:*
  - the VTST scripts by name;
  - recommended image counts and convergence criteria;
  - magnetism in NEB;
  - mistakes: atoms wrapping across the cell, mismatched ordering, LCLIMB on by default, endpoint
    OUTCARs.

**A5 · AIMD and machine-learned force fields** (`aimd-mlff`)
- *MDALGO table*, with the VASP version for each value. *Ensembles:* how to get NVE, NVT and NpT
  (NpT only with Langevin and ISIF=3).
- *Settings:*
  - the defaults that silently give NVE;
  - POTIM for light atoms; ISYM=0; fast electronic settings;
  - restarting with velocities.
- *Analysis:* the OSZICAR MD line, XDATCAR, temperature and energy drift, RDF, MSD → diffusion,
  VDOS, tools.
- *MLFF:* ML_MODE values and their versions, ML_* files, the spilling-factor stop, best practices.

## 7. Interactive tools (shared, tested)

All the tools run in the browser on the user's own input. Nothing is uploaded, and the only thing
stored is an optional preference in `localStorage`. The logic lives in `cheat-tools.js` with Node
tests:

| Tool | Tested against |
| --- | --- |
| POSCAR parser (feeds the next three) | pymatgen parses of the same files |
| k-mesh calculator | the Wiki's KSPACING and Auto formulas, hand-checked cells, pymatgen |
| MAGMOM builder | round-trips `N*value` compression; atom counts must match |
| INCAR builder + lint | every recipe on every sheet must pass the lint |
| Slurm generator | divisibility rules (KPAR, NCORE, IMAGES); `bash -n` and shellcheck on its output |
| Error lookup | every error string on E7 must match its own entry |
| OSZICAR plotter | real OSZICAR files in `dft/_research/testfiles/` |

## 8. Accuracy protocol for the sheets

1. **Every tag is read on the VASP Wiki when its sheet is written.** The registry (`terms.json`)
   records the default, the minimum version and the date checked. The build stamps "Checked
   against VASP 6.6.1".
2. **The build lints every INCAR block.** A tag missing from the registry fails the build (this
   catches typos like ISMAER), and the INCAR builder's conflict rules run on every recipe.
3. **Every shell one-liner is tested on real files.** The 19 public OUTCAR/OSZICAR/vasprun.xml
   files from pymatgen's and ASE's test suites (VASP 5.x–6.3, including NiO with SOC, a
   stopped run and r²SCAN) are already saved. Each command's output is compared with the
   parser's answer, e.g. pymatgen's final energy.
4. **No invented output and no POTCAR contents.** Output excerpts come only from the public
   real-run files in `dft/_research/testfiles/` (pymatgen and ASE test suites). Otherwise the
   format is described in words. POTCAR commands are shown, never their output.
5. **Slurm templates** are general, and pass `bash -n` and shellcheck.
6. **One independent fact-check per sheet:** a single agent gets the finished page and its
   sources, not my reasoning.
7. **Your review** of each finished sheet. Anything wrong is fixed and dated in Corrections.
8. **Re-check at each VASP release** against the changelog and the Known issues page.

## 9. SEO

- Titles as in §3, each with "VASP" plus a specific noun. Descriptions of at most 160 characters,
  and keywords as people type them (hyphenated).
- **JSON-LD:**
  - hub: `CollectionPage` + `ItemList` + `BreadcrumbList`;
  - sheets: `TechArticle` + `LearningResource` (learningResourceType "cheat sheet") with
    `dateModified`, `isPartOf` the course, and `about` the tags.
- A visible version and date stamp; sitemap `lastmod` from `cheatsheets.json`; canonical URLs.
- Error strings as `<h3 id>` anchors (§5). Tag names link to their VASP Wiki pages.
- **Internal links:**
  - the site home dropdown gets "VASP cheat sheets";
  - the DFT card on the site home gets a cheat-sheets action;
  - the course home gets a "VASP cheat sheets" section and a top-bar link;
  - each lecture links its related sheets, and each sheet links its lecture;
  - the symmetry guide is linked from the KPOINTS and POSCAR sheets.

## 10. Build order

- **Phase C0 — framework.**
  - `cheatsheets.json`, `_cheat/`, `cheat.js`, `cheat-tools.js`, build functions, CSS (screen and
    print), the tag lint and test harness.
  - The hub, which publishes with the first sheet.
- **Phase C1 — Essentials:** INCAR → KPOINTS → POTCAR → POSCAR → Slurm → Reading output →
  Errors.
- **Phase C2 — Applications:** Relaxation → Magnetism → Properties → NEB → AIMD/MLFF.
- **Per-sheet loop:**
  1. distil that sheet's brief, and re-read on the VASP Wiki every quote and default that goes on
     the page (the briefs came through a summarising fetcher);
  2. write;
  3. tool and command tests;
  4. one fact-check;
  5. fixes;
  6. you review;
  7. commit when you ask.

  §6 of this plan serves as the outline, so you approve it once here, and I report after each sheet.
- **Token budget:** the research is finished. Building a sheet means reading its brief and
  checking quotes on the Wiki, with no new research fan-outs.

## 11. Decisions (user, 2026-11-06)

1. **Keep everything general.** No cluster-specific profile, and no input or output files from the
   user. Sample output comes only from public real-run test files.
2. **Research:** finished on 2026-11-06. The stopped agents were resumed briefly to write their
   briefs from what they had already gathered.
3. **POSCAR sheet:** included as proposed, since it was not objected to.

## 12. Build log

**2026-11-06: framework, hub and E1 INCAR.**
- **Framework:**
  - `cheatsheets.json` and `_cheat/`;
  - the `build_dft.mjs` functions `sheetPage()`, `cheatHub()` and `cheatBlock()` (the course home section);
  - `cheat.css`, `cheat.js` and `cheat-tools.js` (INCAR parser, 30 checker rules, builder);
  - `scripts/test_cheat.mjs`;
  - row popovers in `deck.js`;
  - sitemap `lastmod` from `cheatsheets.json`;
  - links from the site home menu and DFT card;
  - social image `assets/fig/vasp-cheat-sheets.webp`.
- **The tag registry in `terms.json`** has 57 tags: `group`/`short`/`use`/`pitfall`/`since` were added to the tags the INCAR sheet tables use. Defaults were checked against the verbatim Wiki source in `dft/_research/wiki-cache` and `wiki-raw3`.
- **The build rejects** an INCAR block with an unknown tag, a non-ASCII character or an error-level rule.
- **Tests:** 7,583 checks pass. They cover all 1,080 builder combinations, every recipe on the sheet, and the shell commands run on real OUTCAR and vasprun.xml files from VASP 5.2.2–6.3.0.
  - One finding: VASP 6.1.1 and 5.x print no INCAR echo, so the echo command is labelled "6.2 and later" and uses `awk` so it stops at the POTCAR lines.
- **Fact-check:** one independent check found 10 issues, all confirmed and fixed:
  - vasprun.xml calls the cutoff ENMAX in `<parameters>`;
  - LCHARG was `.NOT. LH5`;
  - the METAGGA tag predates 6.2.0;
  - meta-GGA band structures follow the hybrid procedure, not ICHARG = 11;
  - hybrids use ALGO = All with ISEARCH = 1;
  - with ISIF = 0 the atoms still move;
  - NBANDS was triggered by negative moments;
  - PREC does not set ENCUT;
  - the ISEARCH note was too broad (it also matched GW/RPA ALGO values);
  - one version comment was misleading.
- **Browser checks:** no console errors, and no horizontal scroll at 1440 px or 390 px on the sheet, hub and course home.
- **Next:** E2 KPOINTS, which has a brief in `part3-kpoints-part5-poscar.md`.

**2026-11-06 (later): all 11 remaining sheets.** The user chose "All 11 now". Built in order:
KPOINTS, POSCAR, POTCAR → Slurm, reading output, errors → relaxation, magnetism → properties, NEB, AIMD + MLFF.
- **Tools (all in `cheat-tools.js`, tested in Node):**
  - k-mesh calculator and POSCAR checker (shared POSCAR parser: scale/volume/three factors, VASP 4 format, selective dynamics, shortest distance with images, digit check, cell-shape guess);
  - POTCAR planner (VASP's recommended potpaw.64 PBE list valid since October 2026, parsed from the Wiki table: 96 elements with ZVAL and ENMAX);
  - Slurm generator (bash -n on 144 layouts; KPAR divides ranks and k-points; NCORE near √ranks; GPU rules; STOPCAR trap with correct exit status);
  - command finder, error lookup and property finder (one finder component);
  - MAGMOM builder (FM, alternating planes along a/b/c with a 0.01 tolerance, custom per site, noncollinear; odd-plane warning).
- **Registry:** 135 tags; VTST tags flagged and linked to the VTST docs.
- **Tests:** 8,040 checks.
  - Every INCAR, POSCAR and KPOINTS block parses and passes the rules.
  - Every OUTCAR/OSZICAR/vasprun.xml command runs on the 9 real outputs and finds something in at least one of them. The two exceptions have no matching test file: the band-gap grep (no 6.4.3+ OUTCAR) and the MD OSZICAR line (no MD OSZICAR).
  - Every script on the pages passes `bash -n`.
  - Every error card is found from its own message.
  - `shellcheck` is not installed here, so it was not used.
- **Fact-checks:** five independent batches (INCAR; KPOINTS, POSCAR, POTCAR; Slurm, output, errors; relaxation, magnetism; properties, NEB, AIMD) with 10 + 11 + 7 + 8 + 8 findings. All were applied except one from the last batch: r²SCAN band structures with ICHARG = 11 stay "6.6.0 and later", because the wiki's DFT band-structure page and the 6.6.0 Changelog both support it (the meta-GGA band-structure page is older). Highlights:
  - elastic tensor: VASP order XX YY ZZ XY YZ ZX becomes Voigt order by reordering 1 2 3 5 6 4 (a 4↔6 swap exchanges C44 and C55);
  - DIPOL unset means VASP places the centre half a cell from the charge-density minimum, not at the centre of mass;
  - LOPTICS with τ-meta-GGA and spin-orbit is hit by known issue 100 (use LPEAD = .TRUE.);
  - VTST checks only the EDIFFG sign, not IBRION = 3 and POTIM = 0;
  - ML_MODE unset with ML_LMLFF = .TRUE. means train; LPHON_DISPERSION gives bands only;
  - ISTART = 1 handles a new cell or ENCUT;
  - KPAR should divide the k-points;
  - the GPU hybrid crash is still open in 6.6.1;
  - the ZBRENT bracketing bug was fixed in 6.6.0 (Changelog; this settles the open question in §2);
  - the OSZICAR one-liners now match fields by name, so they work for MD too;
  - the NiO sample cell was corrected;
  - MAGMOM planes are now clustered with a tolerance;
  - Cubic BN uses a = 3.615 Å;
  - hexagonal cells may also use a 1/3 shift;
  - POSCAR labels such as Fe1 are mapped to their element.
- **Browser checks:** the hub, all 12 sheets and the course home have no console errors and no horizontal scroll at 1440 px or 390 px. Link check: 23 pages, 0 problems.
