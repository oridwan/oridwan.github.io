/* VASP cheat sheets: logic for the interactive tools. No DOM, so every function is tested
   under Node (scripts/test_cheat.mjs) and used unchanged in the browser (cheat.js).

   INCAR rules follow the VASP Wiki pages for each tag (checked against VASP 6.6.1, 2026-11-06).
   Rules marked "advice" restate the VASP developers' recommendations; "rule" marks community
   practice. */

/* ---------------- INCAR parsing ---------------- */

/** Parse INCAR text into [{tag, value, line}] in file order. Follows the INCAR format:
 *  "#" or "!" starts a comment, ";" separates statements, "\" at the end of a line continues it. */
export function parseIncar(text) {
  const out = [];
  const lines = String(text).replace(/\r/g, '').split('\n');
  let buf = '', start = 0;
  lines.forEach((raw, i) => {
    let s = raw.replace(/[#!].*$/, '');
    if (!buf) start = i + 1;
    if (/\\\s*$/.test(s)) { buf += s.replace(/\\\s*$/, ' '); return; }
    s = buf + s; buf = '';
    for (const part of s.split(';')) {
      const m = part.match(/^\s*([A-Za-z][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (m) out.push({ tag: m[1].toUpperCase(), value: m[2], line: start });
    }
  });
  return out;
}

const T = /^\.?t/i, F = /^\.?f/i;
export const bool = v => (v == null ? undefined : T.test(v) ? true : F.test(v) ? false : undefined);
export const num = v => (v == null ? undefined : parseFloat(String(v).replace(/[dD]/, 'e')));

/** Expand MAGMOM-style "N*value" shorthand: "2*5.0 -1" -> [5, 5, -1]. */
export function expandValues(v) {
  const out = [];
  for (const w of String(v).trim().split(/\s+/).filter(Boolean)) {
    const m = w.match(/^(\d+)\*(.+)$/);
    if (m) for (let i = 0; i < +m[1]; i++) out.push(num(m[2]));
    else out.push(num(w));
  }
  return out;
}

/** Compress a list of numbers into "N*value" form: [5,5,-1] -> "2*5 -1". */
export function compressValues(list) {
  const out = [];
  for (let i = 0; i < list.length;) {
    let j = i;
    while (j < list.length && list[j] === list[i]) j++;
    const n = j - i, v = fmt(list[i]);
    out.push(n > 1 ? `${n}*${v}` : v);
    i = j;
  }
  return out.join(' ');
}
const fmt = x => (Number.isInteger(x) ? x.toFixed(1) : String(x));

/* ---------------- INCAR checks ---------------- */

/** Each rule: id, level (error | warn | info), and a test returning a message or nothing.
 *  `t` maps tag -> value string (last occurrence wins, as in VASP). */
export const RULES = [
  { id: 'ibrion-default', level: 'error', test: t => num(t.NSW) > 0 && t.IBRION == null && t.POTIM == null &&
      'NSW > 0 but IBRION is not set: IBRION then defaults to 0 (molecular dynamics), which has no default time step, so VASP stops. For a relaxation set IBRION = 2 (or 1).' },
  { id: 'ibrion-default-md', level: 'warn', test: t => num(t.NSW) > 0 && t.IBRION == null && t.POTIM != null &&
      'NSW > 0 with no IBRION runs molecular dynamics (IBRION defaults to 0). If you meant a relaxation, set IBRION = 2 (or 1).' },
  { id: 'md-potim', level: 'error', test: t => num(t.IBRION) === 0 && t.POTIM == null &&
      'IBRION = 0 (molecular dynamics) needs POTIM, the time step in fs: it has no default.' },
  { id: 'ibrion-static-nsw', level: 'warn', test: t => num(t.IBRION) === -1 && num(t.NSW) > 0 &&
      'IBRION = -1 with NSW > 0 recomputes the same structure NSW times. Use NSW = 0 for a static run.' },
  { id: 'hybrid-icharg11', level: 'error', test: t => bool(t.LHFCALC) && num(t.ICHARG) === 11 &&
      'Never fix the density (ICHARG = 11) in a hybrid-functional run. Put the band path in KPOINTS with zero weights, or in a KPOINTS_OPT file.' },
  { id: 'hybrid-veryfast', level: 'error', test: t => bool(t.LHFCALC) && /^v/i.test(t.ALGO || '') &&
      'ALGO = VeryFast is not supported for hybrid functionals. Use ALGO = All (or Normal; Damped if those fail).' },
  { id: 'npar-ncore', level: 'warn', test: t => t.NPAR != null && t.NCORE != null &&
      'NCORE and NPAR are both set: NPAR wins, for legacy reasons. Keep NCORE and delete NPAR.' },
  { id: 'npar-legacy', level: 'info', test: t => t.NPAR != null && t.NCORE == null &&
      'NPAR is a legacy tag; NCORE (cores per band) is the recommended way to set the same thing.' },
  { id: 'tet-forces', level: 'warn', test: t => [-4, -5].includes(num(t.ISMEAR)) && num(t.NSW) > 0 && [1, 2, 3].includes(num(t.IBRION)) &&
      'The tetrahedron method (ISMEAR = -5) is not variational: in metals the forces and stress can be off by 5 to 10%. Relax metals with ISMEAR = 1 or 2, insulators with ISMEAR = 0; keep -5 for the final static run.' },
  { id: 'tet-mesh', level: 'info', test: t => [-4, -5, -14, -15].includes(num(t.ISMEAR)) &&
      'Tetrahedron methods need a Γ-centred k-point mesh with at least 4 k-points.' },
  { id: 'metagga-lasph', level: 'warn', test: t => t.METAGGA && !/^none$/i.test(t.METAGGA) && !bool(t.LASPH) &&
      'Meta-GGA (METAGGA) should be run with LASPH = .TRUE.; its default stays .FALSE.' },
  { id: 'hybrid-lasph', level: 'info', test: t => bool(t.LHFCALC) && !bool(t.LASPH) &&
      'Hybrid functionals: LASPH = .TRUE. is recommended (its default is .FALSE.).' },
  { id: 'algo-all-isearch', level: 'info', test: t => /^(a|all|c|conjugate)$/i.test(t.ALGO || '') && t.ISEARCH == null &&
      'With ALGO = All, ISEARCH = 1 (the improved line search, VASP 6.5.1 and later) is recommended; ISEARCH still defaults to 0.' },
  { id: 'lreal-true', level: 'warn', test: t => t.LREAL != null && (bool(t.LREAL) === true || /^o/i.test(t.LREAL)) &&
      'LREAL = .TRUE. or On is not recommended. Use LREAL = Auto (systems above about 30 atoms) or .FALSE.' },
  { id: 'encut-missing', level: 'warn', test: t => t.ENCUT == null &&
      'ENCUT is not set. Its default is the largest ENMAX of your POTCAR, so energies from runs with different elements are not comparable. Set it explicitly.' },
  { id: 'pulay', level: 'info', test: t => num(t.NSW) > 0 && [1, 2, 3].includes(num(t.IBRION)) && num(t.ISIF) >= 3 &&
      'The cell changes (ISIF ≥ 3): expect Pulay stress. Use ENCUT ≥ 1.3 × the largest ENMAX and re-run from CONTCAR until the cell stops changing.' },
  { id: 'ediffg-energy', level: 'info', test: t => num(t.NSW) > 0 && [1, 2, 3].includes(num(t.IBRION)) && !(num(t.EDIFFG) < 0) &&
      'EDIFFG is not negative, so the relaxation stops on an energy change (default 10 × EDIFF), not on forces. EDIFFG = -0.02 stops when every force is below 0.02 eV/Å.' },
  { id: 'magmom-no-spin', level: 'warn', test: t => t.MAGMOM != null && num(t.ISPIN) !== 2 && !bool(t.LNONCOLLINEAR) && !bool(t.LSORBIT) &&
      'MAGMOM is set but ISPIN is not 2, so the run is not spin-polarized and MAGMOM only affects the symmetry. Add ISPIN = 2.' },
  { id: 'spin-default-magmom', level: 'info', test: t => num(t.ISPIN) === 2 && t.MAGMOM == null &&
      'ISPIN = 2 without MAGMOM: every atom starts at 1 μB. Set MAGMOM (one value per atom, in POSCAR order) to choose the magnetic state.' },
  { id: 'ncl-ispin', level: 'warn', test: t => (bool(t.LNONCOLLINEAR) || bool(t.LSORBIT)) && t.ISPIN != null &&
      'Noncollinear runs (LNONCOLLINEAR or LSORBIT) ignore ISPIN, and recent versions reject ISPIN = 2 combined with them. Delete ISPIN.' },
  { id: 'ncl-binary', level: 'info', test: t => (bool(t.LNONCOLLINEAR) || bool(t.LSORBIT)) &&
      'Noncollinear and spin–orbit runs need the vasp_ncl executable, and MAGMOM takes three components per atom.' },
  { id: 'prec-deprecated', level: 'warn', test: t => /^(low|medium|high)$/i.test(t.PREC || '') &&
      'PREC = Low, Medium and High are deprecated. Use Normal or Accurate, and raise ENCUT yourself if you need more.' },
  { id: 'addgrid', level: 'warn', test: t => bool(t.ADDGRID) &&
      'ADDGRID = .TRUE. is not meant as a default: use it only after tests show it helps your forces.' },
  { id: 'icharg11', level: 'info', test: t => num(t.ICHARG) === 11 && !bool(t.LHFCALC) &&
      'ICHARG = 11 reads CHGCAR from a converged self-consistent run on a full k-mesh. LMAXMIX must match that run (4 for d elements, 6 for f elements).' },
  { id: 'icharg11-nsw', level: 'warn', test: t => num(t.ICHARG) === 11 && num(t.NSW) > 0 &&
      'ICHARG = 11 keeps the density fixed: it is for DOS and band structures, not for relaxations. Set NSW = 0.' },
  { id: 'kspacing', level: 'info', test: t => t.KSPACING != null &&
      'KSPACING is used only when there is no KPOINTS file in the folder.' },
  { id: 'md-isym', level: 'info', test: t => num(t.IBRION) === 0 && num(t.ISYM) !== 0 &&
      'Molecular dynamics: switch symmetry off with ISYM = 0.' },
  { id: 'lorbit-rwigs', level: 'info', test: t => t.LORBIT != null && num(t.LORBIT) < 10 && t.RWIGS == null &&
      'LORBIT below 10 needs RWIGS. LORBIT = 11 needs no RWIGS and gives the lm-resolved projections.' },
  { id: 'nelm-high', level: 'info', test: t => num(t.NELM) > 200 &&
      'A very large NELM rarely helps: an SCF that has not converged in about 40 steps usually needs a different ALGO or mixing instead.' },
];

/** Check an INCAR. `known` (optional Set) flags tags outside the sheet's list as possible typos.
 *  Returns [{level, id, message}] sorted error → warn → info. */
export function lintIncar(text, known) {
  const entries = parseIncar(text);
  const t = {}, at = {};
  const out = [];
  for (const e of entries) {
    if (e.tag in t && t[e.tag] !== e.value)
      out.push({ level: 'warn', id: 'duplicate', message: `${e.tag} is set twice (lines ${at[e.tag]} and ${e.line}) with different values. Keep one.` });
    at[e.tag] = e.line;
    t[e.tag] = e.value;
  }
  if (known) {
    for (const e of entries)
      if (!known.has(e.tag)) out.push({ level: 'info', id: 'unlisted', tag: e.tag, message: `${e.tag} is not on this sheet's list. If it is not a typo, check its page on the VASP Wiki.` });
  }
  for (const r of RULES) {
    const m = r.test(t);
    if (m) out.push({ level: r.level, id: r.id, message: m });
  }
  const order = { error: 0, warn: 1, info: 2 };
  return out.sort((a, b) => order[a.level] - order[b.level]);
}

/* ---------------- INCAR builder ---------------- */

export const BUILDER_OPTIONS = {
  task: [['static', 'Static (single point)'], ['relax-ions', 'Relax atoms, fixed cell'], ['relax-cell', 'Relax atoms and cell'],
         ['dos', 'Density of states (from CHGCAR)'], ['bands', 'Band structure (from CHGCAR)']],
  material: [['insulator', 'Insulator or semiconductor'], ['metal', 'Metal'], ['unknown', 'Not sure']],
  spin: [['none', 'Non-magnetic'], ['fm', 'Ferromagnetic'], ['afm', 'Antiferromagnetic']],
  xc: [['pbe', 'PBE'], ['pbesol', 'PBEsol'], ['r2scan', 'r²SCAN'], ['hse06', 'HSE06']],
  elements: [['sp', 's and p only'], ['d', 'd elements'], ['f', 'f elements']],
  size: [['small', 'Up to about 30 atoms'], ['large', 'More than about 30 atoms']],
};

const ceil10 = x => Math.ceil(x / 10) * 10;

/** Build an annotated INCAR. Returns {lines: [[tag, value, comment] | ['#', text]], notes: [string]}.
 *  opts: task, material, spin, xc, elements, size, enmax (largest ENMAX, eV), magmom (string). */
export function buildIncar(o) {
  const L = [], notes = [];
  const add = (tag, value, comment = '') => L.push([tag, String(value), comment]);
  const head = text => L.push(['#', text]);
  const nonscf = o.task === 'dos' || o.task === 'bands';
  const relax = o.task === 'relax-ions' || o.task === 'relax-cell';
  const hybrid = o.xc === 'hse06', meta = o.xc === 'r2scan';
  // hybrids and meta-GGAs never fix the density: a self-consistent run with the path in KPOINTS_OPT instead
  const hybridBands = (hybrid || meta) && nonscf;

  head('Basis and precision');
  const enmax = num(o.enmax) > 0 ? num(o.enmax) : 400;
  add('ENCUT', ceil10(1.3 * enmax), `1.3 × largest ENMAX (${enmax} eV); converge it, keep it fixed across runs`);
  add('PREC', 'Accurate', 'Normal is enough for quick tests');
  if (o.elements !== 'sp' || meta || hybrid) add('LASPH', '.TRUE.', 'non-spherical PAW terms: d/f elements, meta-GGA and hybrids');
  if (o.size === 'large' && relax) add('LREAL', 'Auto', 'real-space projection for large cells; finish with a LREAL = .FALSE. static run');
  else if (o.size === 'large') add('LREAL', '.FALSE.', 'final energies without real-space projection');

  head('Functional');
  if (o.xc === 'pbe') add('GGA', 'PE', 'PBE (also the default with PBE POTCARs)');
  if (o.xc === 'pbesol') add('GGA', 'PS', 'PBEsol');
  if (meta) add('METAGGA', 'R2SCAN', 'needs POTCARs with kinetic-energy data (grep kinetic POTCAR); use VASP 6.6.1, not 6.6.0, for spin-polarized forces');
  if (hybrid) {
    add('LHFCALC', '.TRUE.', 'hybrid functional');
    add('HFSCREEN', '0.2', 'HSE06 (0.3 would be HSE03); AEXX defaults to 0.25');
  }

  head('Electronic minimization');
  if (meta || hybrid) {
    add('ALGO', 'All', meta ? 'often more stable for meta-GGA' : 'direct optimization: the recommended choice for hybrids');
    add('ISEARCH', '1', 'improved line search for ALGO = All (VASP 6.5.1 and later; delete on older versions)');
  } else {
    add('ALGO', 'Normal', o.spin !== 'none' ? 'if the SCF struggles: ALGO = All ; ISEARCH = 1' : 'blocked Davidson, the robust default');
  }
  add('EDIFF', '1E-6', 'SCF convergence in eV');
  add('NELM', '100', 'if it needs more than about 40 steps, change ALGO or mixing instead');

  head('Smearing');
  const smear = (ismear, sigma, comment) => { add('ISMEAR', ismear, comment); if (sigma != null) add('SIGMA', sigma, 'eV'); };
  if (o.task === 'bands') {
    smear(0, 0.05, 'Gaussian; the Fermi energy cannot be computed on a path, so take E-fermi from the SCF run');
  } else if (o.material === 'unknown') {
    smear(0, 0.1, 'Gaussian: the safe start when you do not know if the system is a metal');
    add('EFERMI', 'MIDGAP', 'Fermi level in the middle of the gap, if there is one (VASP 6.4 and later)');
  } else if (o.material === 'metal') {
    if (relax) smear(1, 0.2, 'Methfessel–Paxton for metal forces; keep "entropy T*S" in OUTCAR below 1 meV/atom');
    else smear(-5, null, 'tetrahedron with Blöchl corrections: accurate total energy and DOS (dense Γ-centred mesh)');
  } else {
    if (relax) smear(0, 0.05, 'Gaussian; never ISMEAR > 0 for insulators');
    else smear(-5, null, 'tetrahedron: needs a Γ-centred mesh with at least 4 k-points, else ISMEAR = 0 ; SIGMA = 0.05');
  }

  head(relax ? 'Ionic relaxation' : 'No ionic steps');
  if (relax) {
    add('IBRION', '2', 'conjugate gradient: robust far from the minimum (1 = RMM-DIIS when close)');
    add('ISIF', o.task === 'relax-cell' ? '3' : '2', o.task === 'relax-cell' ? 'atoms, cell shape and volume' : 'atoms only, cell fixed');
    add('NSW', '100', 'maximum ionic steps');
    add('EDIFFG', '-0.02', 'stop when all forces are below 0.02 eV/Å (negative = force criterion)');
    add('NELMIN', '4', 'at least 4 SCF steps per ionic step for accurate forces');
    if (o.task === 'relax-cell') notes.push('Re-run from CONTCAR (cp CONTCAR POSCAR) until the volume stops changing: the basis was set up for the starting cell (Pulay stress).');
  } else {
    add('NSW', '0', 'static: atoms do not move');
    add('IBRION', '-1', '');
  }
  if (hybrid && o.task === 'relax-cell') notes.push('Hybrids: ISIF defaults to 0 (no stress), so ISIF = 3 must stay set explicitly.');

  if (o.spin !== 'none') {
    head('Spin');
    add('ISPIN', '2', 'collinear spin-polarized');
    const mm = String(o.magmom || '').trim();
    if (mm) add('MAGMOM', mm, o.spin === 'afm' ? 'one value per atom, POSCAR order, opposite signs on the two sublattices' : 'one value per atom, POSCAR order; start above the expected moment');
    else {
      L.push(['#', o.spin === 'afm'
        ? 'MAGMOM = 2*5.0 2*-5.0   ! example only: one value per atom, opposite signs on the two sublattices'
        : 'MAGMOM = <one value per atom>   ! default is 1 μB per atom; start about 1.2–1.5 × the expected moment']);
      notes.push('Set MAGMOM yourself: one value per atom, in the order of the POSCAR.');
    }
    if (o.spin === 'afm') notes.push('The cell must contain both spin sublattices; an antiferromagnet often needs a supercell.');
  }

  if (nonscf && !hybridBands) {
    head(o.task === 'dos' ? 'Density of states from the converged CHGCAR' : 'Band structure from the converged CHGCAR');
    add('ICHARG', '11', 'read CHGCAR and keep the density fixed');
    if (o.task === 'dos') add('NEDOS', '2001', 'fine energy grid for a smooth DOS');
    notes.push(o.task === 'dos'
      ? 'Use a denser Γ-centred k-mesh than the self-consistent run, and copy its CHGCAR into this folder.'
      : 'Put the high-symmetry path in KPOINTS (line mode) and copy CHGCAR from the self-consistent run.');
  }
  if (hybridBands) {
    const who = hybrid ? 'Hybrids' : 'Meta-GGAs such as r²SCAN';
    notes.push(o.task === 'bands'
      ? `${who} do not use ICHARG = 11. Run self-consistently on the regular mesh and add the path in a KPOINTS_OPT file (VASP 6.3.0 and later), or as zero-weight k-points in KPOINTS.`
      : `${who} do not use ICHARG = 11. Run the DOS self-consistently on the denser Γ-centred mesh.`);
    if (o.task === 'dos') add('NEDOS', '2001', 'fine energy grid for a smooth DOS');
    if (o.task === 'bands' && hybrid) add('HFRCUT', '-1', 'Coulomb truncation: the best-converging choice for band structures of gapped systems');
  }

  head('Output');
  const lm = o.elements === 'f' ? 6 : o.elements === 'd' ? 4 : 0;
  if (lm) add('LMAXMIX', lm, `${o.elements} elements: needed for CHGCAR restarts and ICHARG = 11, and must match between the runs`);
  add('LORBIT', '11', 'lm-projected DOS and site moments, no RWIGS needed');
  add('LCHARG', o.task === 'static' ? '.TRUE.' : '.FALSE.', o.task === 'static' ? 'keep CHGCAR for the DOS and band runs' : '');
  add('LWAVE', hybrid ? '.TRUE.' : '.FALSE.', hybrid ? 'hybrids are expensive: keep WAVECAR for restarts' : 'WAVECAR is large; write it only when a later run reads it');
  return { lines: L, notes };
}

/** Input files stay plain ASCII: typographic characters in comments are spelled out. */
const ASCII = { '×': 'x', 'μ': 'mu', 'Å': 'A', 'Γ': 'Gamma', '–': '-', '—': '-', '−': '-', '≥': '>=', '≤': '<=', '²': '2', '’': "'", '“': '"', '”': '"', '→': '->', 'ö': 'o', '…': '...' };
export const asciiOnly = s => String(s).replace(/[^\x00-\x7f]/g, ch => ASCII[ch] ?? '?');

/** Render builder output as INCAR text with aligned comments (plain ASCII). */
export function incarText({ lines }) {
  const rows = lines.filter(l => l[0] !== '#');
  const w = Math.max(...rows.map(([t, v]) => `${t} = ${v}`.length));
  return lines.map(l => {
    if (l[0] === '#') return `# ${l[1]}`;
    const s = `${l[0]} = ${l[1]}`;
    return l[2] ? `${s.padEnd(w + 2)}! ${l[2]}` : s;
  }).map(asciiOnly).join('\n') + '\n';
}

/** Every combination of builder options, for tests. */
export function allBuilderCombos() {
  const keys = ['task', 'material', 'spin', 'xc', 'elements', 'size'];
  let combos = [{}];
  for (const k of keys)
    combos = combos.flatMap(c => BUILDER_OPTIONS[k].map(([v]) => ({ ...c, [k]: v })));
  return combos;
}
