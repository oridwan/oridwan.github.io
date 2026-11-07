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

/* ---------------- POSCAR ---------------- */

const det3 = m => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
const norm = v => Math.hypot(v[0], v[1], v[2]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const isNum = w => /^[-+]?(\d+\.?\d*|\.\d+)([eEdD][-+]?\d+)?$/.test(w);
const deg = r => (r * 180) / Math.PI;

/** Reciprocal vectors without the 2π factor (b_i · a_j = δ_ij), as VASP defines them for KSPACING. */
export function reciprocal(lat) {
  const V = det3(lat);
  return [cross(lat[1], lat[2]), cross(lat[2], lat[0]), cross(lat[0], lat[1])].map(v => v.map(x => x / V));
}

/** Lattice lengths (Å) and angles (degrees): a, b, c, alpha (b,c), beta (a,c), gamma (a,b). */
export function cellParams(lat) {
  const [a, b, c] = lat.map(norm);
  const ang = (u, v) => deg(Math.acos(Math.max(-1, Math.min(1, dot(u, v) / (norm(u) * norm(v))))));
  return { a, b, c, alpha: ang(lat[1], lat[2]), beta: ang(lat[0], lat[2]), gamma: ang(lat[0], lat[1]) };
}

/** Guess the lattice type from the cell shape alone (no symmetry analysis), for the k-mesh advice. */
export function cellShape(lat) {
  const p = cellParams(lat);
  const eq = (x, y, t = 1e-3) => Math.abs(x - y) <= t * Math.max(1, Math.abs(y));
  const ang = (x, y) => Math.abs(x - y) < 0.05;
  const abc = eq(p.a, p.b) && eq(p.b, p.c);
  if (abc && ang(p.alpha, 60) && ang(p.beta, 60) && ang(p.gamma, 60)) return 'fcc';
  if (abc && [p.alpha, p.beta, p.gamma].every(x => ang(x, 109.4712))) return 'bcc';
  if (abc && [p.alpha, p.beta, p.gamma].every(x => ang(x, 90))) return 'cubic';
  if (eq(p.a, p.b) && ang(p.alpha, 90) && ang(p.beta, 90) && (ang(p.gamma, 120) || ang(p.gamma, 60))) return 'hexagonal';
  if (abc && ang(p.alpha, p.beta) && ang(p.beta, p.gamma)) return 'rhombohedral';
  if ([p.alpha, p.beta, p.gamma].every(x => ang(x, 90))) return eq(p.a, p.b) || eq(p.b, p.c) || eq(p.a, p.c) ? 'tetragonal' : 'orthorhombic';
  return 'other';
}

/** Parse a POSCAR (VASP 5+ or VASP 4 format). Returns the cell in Å, fractional positions and
 *  {errors, warnings}. Follows the format rules on the VASP Wiki POSCAR page. */
export function parsePoscar(text) {
  const errors = [], warnings = [];
  const lines = String(text).replace(/\r/g, '').split('\n');
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  const out = { errors, warnings };
  const words = i => (lines[i] ?? '').trim().split(/\s+/).filter(Boolean);
  const nums = (i, n, what) => {
    const w = words(i).slice(0, n);
    if (w.length < n || !w.every(isNum)) { errors.push(`Line ${i + 1} should hold ${n} numbers (${what}).`); return null; }
    return w.map(num);
  };
  if (lines.length < 8) { errors.push('Too short: a POSCAR needs a comment, a scale, three lattice vectors, the counts, a coordinate line and the positions.'); return out; }
  out.comment = lines[0];
  // scaling factor(s)
  const sw = words(1).filter(isNum).map(num);
  if (sw.length !== 1 && sw.length !== 3) { errors.push('Line 2 must hold one scaling factor or three (x, y, z).'); return out; }
  if (sw.length === 3 && sw.some(x => !(x > 0))) errors.push('With three scaling factors, all three must be positive.');
  if (sw.length === 1 && sw[0] === 0) errors.push('The scaling factor cannot be 0.');
  const raw = [2, 3, 4].map(i => nums(i, 3, `lattice vector a${i - 1}`));
  if (raw.includes(null) || errors.length) return out;
  let lat;
  if (sw.length === 3) lat = raw.map(v => v.map((x, k) => x * sw[k]));
  else if (sw[0] < 0) {
    const V0 = Math.abs(det3(raw));
    const s = Math.cbrt(-sw[0] / V0);
    lat = raw.map(v => v.map(x => x * s));
    out.scaleFromVolume = s;
  } else lat = raw.map(v => v.map(x => x * sw[0]));
  out.lattice = lat;
  const V = det3(lat);
  if (Math.abs(V) < 1e-8) { errors.push('The three lattice vectors are linearly dependent (zero volume).'); return out; }
  if (V < 0) warnings.push('The lattice vectors form a left-handed set (negative triple product). Swap two of them, and swap the matching columns of the fractional coordinates (and selective-dynamics flags) so the atoms stay put.');
  out.volume = Math.abs(V);
  // species line (VASP 5+) or counts directly (VASP 4)
  let i = 5;
  const w5 = words(5);
  if (w5.length && w5.every(w => /^\d+$/.test(w))) { out.species = null; warnings.push('No species line (VASP 4 format): VASP takes the species from POTCAR, but most tools need the names. Add a line with the element symbols above the counts.'); }
  else {
    out.species = w5;
    i = 6;
    const long = w5.filter(s => s.length > 2);
    if (long.length) warnings.push(`VASP keeps only the first 2 characters of species names: ${long.join(', ')}. The species themselves come from POTCAR, in the order of this line.`);
  }
  const cw = words(i);
  if (!cw.length || !cw.every(w => /^\d+$/.test(w))) { errors.push(`Line ${i + 1} should hold the number of atoms of each species (whole numbers).`); return out; }
  out.counts = cw.map(Number);
  if (out.species && out.species.length !== out.counts.length) errors.push(`${out.species.length} species names but ${out.counts.length} counts.`);
  out.natoms = out.counts.reduce((a, b) => a + b, 0);
  i++;
  out.selective = /^[sS]/.test((lines[i] ?? '').trim());
  if (out.selective) i++;
  const mode = (lines[i] ?? '').trim();
  out.cartesian = /^[cCkK]/.test(mode);
  i++;
  const inv = reciprocal(lat); // rows b_i: fractional = b_i · r
  out.positions = []; out.flags = [];
  let few = false;
  for (let n = 0; n < out.natoms; n++, i++) {
    const w = words(i);
    if (w.length < 3 || !w.slice(0, 3).every(isNum)) { errors.push(`Expected ${out.natoms} position lines; line ${i + 1} is not a position.`); return out; }
    let r = w.slice(0, 3).map(num);
    if (out.cartesian) {
      r = sw.length === 3 ? r.map((x, k) => x * sw[k]) : r.map(x => x * (out.scaleFromVolume ?? sw[0]));
      r = inv.map(b => dot(b, r));
    }
    out.positions.push(r);
    if (out.selective) {
      const f = w.slice(3, 6);
      if (f.length < 3 || !f.every(x => /^[TF]$/i.test(x))) errors.push(`Line ${i + 1}: selective dynamics needs three T/F flags after the coordinates.`);
      out.flags.push(f.map(x => /^t/i.test(x)));
    }
    if (!out.cartesian && w.slice(0, 3).some(x => { const v = num(x); return [3, 6, 12].some(d => { const e = Math.abs(v * d - Math.round(v * d)); return e > 5e-7 && e < 2e-3; }); })) few = true;
  }
  if (few) warnings.push('Some fractional coordinates look like thirds, sixths or twelfths written with too few digits (e.g. 0.3333). Write at least 7 significant digits, or VASP may find a lower symmetry.');
  // shortest interatomic distance, including periodic images
  if (out.natoms <= 400) {
    let best = Infinity, pair = null;
    const cart = f => [0, 1, 2].map(k => f[0] * lat[0][k] + f[1] * lat[1][k] + f[2] * lat[2][k]);
    for (let a = 0; a < out.natoms; a++) for (let b = a; b < out.natoms; b++) {
      const d0 = out.positions[b].map((x, k) => x - out.positions[a][k]);
      for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
        if (a === b && !x && !y && !z) continue;
        const d = norm(cart([d0[0] - Math.round(d0[0]) + x, d0[1] - Math.round(d0[1]) + y, d0[2] - Math.round(d0[2]) + z]));
        if (d < best) { best = d; pair = [a + 1, b + 1]; }
      }
    }
    out.minDist = best; out.minPair = pair;
    if (best < 0.5) warnings.push(`Atoms ${pair[0]} and ${pair[1]} are only ${best.toFixed(3)} Å apart (including periodic images): check the positions and the Direct/Cartesian line.`);
  }
  out.params = cellParams(lat);
  out.shape = cellShape(lat);
  // the species of each site, in order
  out.sites = [];
  (out.counts || []).forEach((c, k) => { for (let j = 0; j < c; j++) out.sites.push(out.species ? out.species[k] : `type ${k + 1}`); });
  return out;
}

/* ---------------- k-point meshes ---------------- */

/** N_i = max(1, ceiling(|b_i| · 2π / KSPACING)), the VASP rule when KSPACING replaces KPOINTS. */
export function meshFromKspacing(lat, kspacing) {
  return reciprocal(lat).map(b => Math.max(1, Math.ceil(norm(b) * 2 * Math.PI / kspacing - 1e-9)));
}
/** N_i = int(max(1, R_k · |b_i| + 0.5)), the rule of the deprecated fully automatic KPOINTS mode. */
export function meshFromLength(lat, Rk) {
  return reciprocal(lat).map(b => Math.floor(Math.max(1, Rk * norm(b) + 0.5)));
}
/** The advice for a mesh on a cell of the given shape (VASP Wiki, KPOINTS: symmetry of the mesh). */
export function meshAdvice(shape, N, gamma) {
  const notes = [];
  if (['fcc', 'hexagonal', 'rhombohedral'].includes(shape) && !gamma)
    notes.push(`This cell looks ${shape}: use a Γ-centred mesh${shape === 'hexagonal' ? ' (Monkhorst–Pack with an even number of in-plane subdivisions breaks the hexagonal symmetry)' : ''}.`);
  if (!gamma && N.some(n => n % 2 === 0)) notes.push('Monkhorst–Pack with even subdivisions does not contain Γ; with odd subdivisions it is identical to the Γ-centred mesh.');
  if (shape === 'other') notes.push('The cell shape does not match a standard setting; the Γ-centred mesh is the safe choice.');
  return notes;
}
export function kpointsText(N, gamma, comment = 'Regular k-point mesh') {
  return `${comment}\n0\n${gamma ? 'Gamma' : 'Monkhorst-Pack'}\n${N.join(' ')}\n0 0 0\n`;
}

/** A light check of a KPOINTS file: the mode from line 3 and the lines it needs. Returns {mode, errors}. */
export function parseKpoints(text) {
  const L = String(text).replace(/\r/g, '').split('\n').map(l => l.replace(/[!#].*$/, '').trim());
  while (L.length && !L[L.length - 1]) L.pop();
  const errors = [];
  const n = parseInt(L[1], 10);
  if (!/^\s*-?\d+/.test(L[1] ?? '')) errors.push('Line 2 must be a whole number: 0 for an automatic mesh, the number of k-points for a list, or points per segment for line mode.');
  const c = (L[2] || ' ')[0];
  const words = i => (L[i] || '').split(/\s+/).filter(Boolean);
  let mode;
  if (/[lL]/.test(c)) {
    mode = 'line';
    if (!(n > 0)) errors.push('Line mode: line 2 is the number of points per segment and must be positive.');
    const pts = L.slice(4).filter(Boolean);
    if (pts.length < 2 || pts.length % 2) errors.push('Line mode needs pairs of points (start and end of each segment).');
    if (pts.some(l => words(L.indexOf(l)).slice(0, 3).filter(isNum).length < 3)) errors.push('Each line-mode point needs three coordinates.');
  } else if (n === 0 && /[gGmM]/.test(c)) {
    mode = /[gG]/.test(c) ? 'gamma' : 'monkhorst-pack';
    const N = words(3);
    if (N.length < 3 || !N.slice(0, 3).every(w => /^\d+$/.test(w) && +w > 0)) errors.push('Line 4 must hold three positive whole numbers, the subdivisions N1 N2 N3.');
    if (L[4] && words(4).slice(0, 3).filter(isNum).length < 3) errors.push('The optional shift on line 5 needs three numbers.');
  } else if (n === 0 && /[aA]/.test(c)) {
    mode = 'auto';
    if (!isNum(words(3)[0] || '')) errors.push('Fully automatic mode: line 4 holds the length R_k.');
  } else if (n === 0) {
    mode = 'generalized';
    for (const i of [3, 4, 5]) if (words(i).slice(0, 3).filter(isNum).length < 3) errors.push(`Line ${i + 1} must hold a generating vector (three numbers).`);
  } else if (n > 0) {
    mode = 'list';
    for (let i = 3; i < 3 + n; i++) if (words(i).slice(0, 4).filter(isNum).length < 4) { errors.push(`Line ${i + 1}: an explicit k-point needs three coordinates and a weight.`); break; }
  }
  return { mode, errors };
}


/* ---------------- POTCAR ---------------- */

/** VASP's recommended potentials for standard DFT, potpaw.64 PBE ("valid since October 2026"):
 *  element -> [potential, valence electrons (ZVAL), ENMAX in eV]. Public table on the VASP Wiki page
 *  "Recommended pseudopotentials"; names and numbers only, no POTCAR content. */
export const RECOMMENDED_PBE64 = {H:["H",1,250],He:["He",2,478.896],Li:["Li_sv",3,499.034],Be:["Be_sv",4,308.768],B:["B",3,318.614],C:["C",4,400],N:["N",5,400],O:["O",6,400],F:["F",7,400],Ne:["Ne",8,343.606],Na:["Na_pv",7,259.561],Mg:["Mg_pv",8,403.929],Al:["Al",3,240.3],Si:["Si",4,245.345],P:["P",5,255.04],S:["S",6,258.689],Cl:["Cl",7,262.472],Ar:["Ar",8,266.408],K:["K_sv",9,259.264],Ca:["Ca_sv",10,266.622],Sc:["Sc_sv",11,222.66],Ti:["Ti_sv",12,274.61],V:["V_sv",13,263.673],Cr:["Cr_pv",12,265.681],Mn:["Mn_pv",13,269.864],Fe:["Fe_pv",14,293.238],Co:["Co_pv",15,271.042],Ni:["Ni_pv",16,367.986],Cu:["Cu_pv",17,368.648],Zn:["Zn",12,276.723],Ga:["Ga_d",13,282.691],Ge:["Ge_d",14,310.294],As:["As",5,208.702],Se:["Se",6,211.555],Br:["Br",7,216.285],Kr:["Kr",8,185.331],Rb:["Rb_sv",9,220.112],Sr:["Sr_sv",10,229.353],Y:["Y_sv",11,202.626],Zr:["Zr_sv",12,229.898],Nb:["Nb_sv",13,293.235],Mo:["Mo_sv",14,242.676],Tc:["Tc_pv",13,263.523],Ru:["Ru_pv",14,240.049],Rh:["Rh_pv",15,247.408],Pd:["Pd",10,250.925],Ag:["Ag",11,249.844],Cd:["Cd",12,274.336],In:["In_d",13,239.211],Sn:["Sn_d",14,241.083],Sb:["Sb",5,172.069],Te:["Te",6,174.982],I:["I",7,175.647],Xe:["Xe",8,153.118],Cs:["Cs_sv",9,220.318],Ba:["Ba_sv",10,187.181],La:["La",11,219.292],Ce:["Ce",12,273.042],Pr:["Pr_3",11,181.719],Nd:["Nd_3",11,182.619],Pm:["Pm_3",11,176.959],Sm:["Sm_3",11,177.087],Eu:["Eu_3",9,129.057],Gd:["Gd_3",9,154.332],Tb:["Tb_3",9,155.613],Dy:["Dy_3",9,155.713],Ho:["Ho_3",9,154.137],Er:["Er_3",9,155.037],Tm:["Tm_3",9,149.221],Yb:["Yb_3",9,188.359],Lu:["Lu_3",9,154.992],Hf:["Hf_pv",10,220.334],Ta:["Ta_pv",11,223.667],W:["W_sv",14,223.057],Re:["Re_pv",13,226.216],Os:["Os_pv",14,228.022],Ir:["Ir",9,210.864],Pt:["Pt",10,230.283],Au:["Au",11,229.943],Hg:["Hg",12,233.204],Tl:["Tl_d",13,237.053],Pb:["Pb_d",14,237.835],Bi:["Bi_d",15,242.839],Po:["Po_d",16,264.565],At:["At",7,161.43],Rn:["Rn",8,151.497],Fr:["Fr_sv",9,214.54],Ra:["Ra_sv",10,237.367],Ac:["Ac",11,172.351],Th:["Th",12,247.306],Pa:["Pa",13,252.193],U:["U",14,252.502],Np:["Np",15,254.26],Pu:["Pu",16,254.353],Am:["Am",17,255.875],Cm:["Cm",18,257.953]};

/** Plan a POTCAR from a species line ("Fe O" or "Fe_pv O_s") and optional counts ("2 3").
 *  Returns rows, the default and suggested ENCUT, NELECT for a neutral cell and the shell commands. */
export function potcarPlan(speciesText, countsText = '') {
  const tokens = String(speciesText).trim().split(/\s+/).filter(Boolean);
  const counts = String(countsText).trim().split(/\s+/).filter(Boolean).map(Number);
  const rows = tokens.map(tok => {
    const el = tok.split(/[_.]/)[0].replace(/\d+$/, '');
    const rec = RECOMMENDED_PBE64[el];
    if (!rec) return { tok, el, pot: tok, known: false, note: `${el} is not an element symbol in the recommended table.` };
    const pot = tok === el || /^[A-Z][a-z]?\d+$/.test(tok) ? rec[0] : tok;   // POSCAR labels like Fe1 mean the element
    const same = pot === rec[0];
    return { tok, el, pot, recommended: rec[0], zval: same ? rec[1] : null, enmax: same ? rec[2] : null, known: true,
      note: same ? '' : `Not VASP's current recommendation for ${el} (${rec[0]}); check its ZVAL and ENMAX with grep.` };
  });
  const enmaxes = rows.map(r => r.enmax).filter(x => x != null);
  const allKnown = rows.length && rows.every(r => r.enmax != null);
  const maxEnmax = allKnown ? Math.max(...enmaxes) : null;
  const nelect = allKnown && counts.length === rows.length && counts.every(n => n >= 0) ? rows.reduce((s, r, i) => s + r.zval * counts[i], 0) : null;
  const cat = 'cat ' + rows.map(r => `"$POTDIR/${r.pot}/POTCAR"`).join(' ') + ' > POTCAR';
  return { rows, maxEnmax, encut13: maxEnmax ? Math.ceil(1.3 * maxEnmax / 10) * 10 : null, nelect, cat };
}


/* ---------------- Slurm job scripts ---------------- */

const divisors = n => { const d = []; for (let i = 1; i <= n; i++) if (n % i === 0) d.push(i); return d; };

/** Suggest KPAR and NCORE for a layout, following the VASP Wiki parallelization advice:
 *  KPAR divides the ranks and is at most the number of irreducible k-points; NCORE is a divisor of the
 *  ranks per node close to sqrt(ranks per k-point group); GPUs and OpenMP force NCORE = 1. */
export function parallelTags({ nodes, ranksPerNode, threads = 1, gpusPerNode = 0, kpts }) {
  const total = nodes * ranksPerNode;
  const notes = [];
  let kpar = 1;
  if (kpts > 0) kpar = Math.max(...divisors(total).filter(d => kpts % d === 0));   // divides both the ranks and the k-points
  const perGroup = total / kpar;
  let ncore = null, nsim = null;
  if (gpusPerNode > 0) {
    nsim = 32;
    notes.push('GPU runs force NCORE = 1, so it is not set. NSIM much larger than the default 4 helps on GPUs: benchmark values between 8 and 32.');
  } else if (threads > 1) {
    notes.push('With OpenMP threads (more than one per rank) VASP sets NCORE = 1 itself.');
  } else {
    const per = Math.min(ranksPerNode, perGroup);
    const cand = divisors(ranksPerNode).filter(d => d <= per && perGroup % d === 0);
    const target = Math.sqrt(perGroup);
    ncore = cand.reduce((b, d) => (Math.abs(d - target) < Math.abs(b - target) ? d : b), 1);
    notes.push(`NCORE = ${ncore} is close to the square root of the ${perGroup} ranks per k-point group. The number of cores per NUMA domain is often better still: benchmark a few values.`);
  }
  if (kpts > 0) notes.push(`KPAR = ${kpar} divides both the ${total} ranks and the ${kpts} irreducible k-points. Each k-point group holds its own copy of the data, so lower KPAR if memory runs out.`);
  else notes.push('Give the number of irreducible k-points (grep "irreducible k-points" OUTCAR, or vasp_std --dry-run) to get a KPAR suggestion.');
  return { total, kpar, ncore, nsim, notes };
}

/** Write a generic Slurm job script. Site-specific lines are placeholders in capitals. */
export function slurmScript(o) {
  const errors = [];
  const nodes = Math.max(1, Math.floor(+o.nodes || 1));
  const rpn = Math.max(1, Math.floor(+o.ranksPerNode || 1));
  const thr = Math.max(1, Math.floor(+o.threads || 1));
  const gpn = Math.max(0, Math.floor(+o.gpusPerNode || 0));
  const exe = ['vasp_std', 'vasp_gam', 'vasp_ncl'].includes(o.exe) ? o.exe : 'vasp_std';
  const time = /^\d+(-\d+)?(:\d\d){0,2}$/.test(String(o.time || '')) ? o.time : '24:00:00';
  const name = String(o.name || 'vasp').replace(/[^A-Za-z0-9_.-]/g, '') || 'vasp';
  const sig = Math.max(0, Math.floor(+o.signalMinutes || 0));
  if (gpn > 0 && rpn !== gpn) errors.push(`GPU builds need exactly one MPI rank per GPU: set ranks per node to ${gpn}.`);
  const tags = parallelTags({ nodes, ranksPerNode: rpn, threads: thr, gpusPerNode: gpn, kpts: +o.kpts || 0 });
  const L = [];
  L.push('#!/bin/bash');
  L.push('# Generic VASP job script: replace ACCOUNT, PARTITION and the module name with your site\'s values.');
  L.push(`# ${nodes} node(s) x ${rpn} MPI ranks${gpn ? ' (one per GPU)' : ''} x ${thr} OpenMP thread(s) per rank = ${nodes * rpn * thr} cores.`);
  L.push(`#SBATCH -J ${name}`);
  L.push('#SBATCH -A ACCOUNT');
  L.push(`#SBATCH -p ${gpn ? 'GPU_PARTITION' : 'PARTITION'}`);
  L.push(`#SBATCH -N ${nodes}`);
  L.push(`#SBATCH --ntasks-per-node=${rpn}`);
  L.push(`#SBATCH -c ${thr}`);
  if (gpn) L.push(`#SBATCH --gpus-per-node=${gpn}`);
  L.push(`#SBATCH -t ${time}`);
  L.push('#SBATCH -o %x-%j.out');
  L.push('#SBATCH -e %x-%j.err');
  if (sig) {
    L.push(`#SBATCH --signal=B:USR1@${sig * 60}`);
    L.push(`# --signal: Slurm sends USR1 to this script ${sig} min before the time limit (see the trap below).`);
  }
  L.push('# The .err file collects segfaults, out-of-memory kills and time-limit messages.');
  L.push('');
  L.push('module purge');
  L.push(`module load vasp/VERSION${gpn ? '-gpu' : ''}       # replace: your site's VASP module (avoid 6.6.0 for spin-polarized meta-GGA)`);
  L.push('');
  L.push('ulimit -s unlimited                  # VASP keeps large arrays on the stack');
  L.push(`export OMP_NUM_THREADS=${thr}`);
  L.push('export OMP_STACKSIZE=512m');
  L.push('export OMP_PLACES=cores OMP_PROC_BIND=close');
  L.push('');
  L.push('cd "$SLURM_SUBMIT_DIR" || exit 1');
  const run = `srun -n ${tags.total} -c ${thr} --cpu-bind=cores${gpn ? ' --gpu-bind=none' : ''} ${exe} > vasp.out`;
  if (sig) {
    L.push('rm -f STOPCAR                        # a leftover STOPCAR would stop this run at once');
    L.push(`trap 'echo "LSTOP = .TRUE." > STOPCAR' USR1   # stop cleanly after the current ionic step`);
    L.push(`${run} &`);
    L.push('pid=$!');
    L.push('wait $pid; status=$?');
    L.push('if [ $status -gt 128 ]; then         # the signal interrupted wait: let VASP finish its step');
    L.push('  wait $pid; status=$?');
    L.push('fi');
    L.push('exit $status                         # keeps the exit code for --dependency=afterok');
  } else L.push(run);
  const incar = [];
  if (tags.kpar > 1) incar.push(`KPAR  = ${tags.kpar}`);
  if (tags.ncore) incar.push(`NCORE = ${tags.ncore}`);
  if (tags.nsim) incar.push(`NSIM  = ${tags.nsim}`);
  // align the trailing comments
  const out = L.map(l => { const m = l.match(/^(.*?\S)\s{2,}(# .*)$/); return m && !l.startsWith('#') ? m[1].padEnd(37) + ' ' + m[2] : l; });
  return { script: out.join('\n') + '\n', incar, notes: tags.notes, errors, total: tags.total };
}


/* ---------------- MAGMOM ---------------- */

/** Starting moments (μB) suggested for a high-spin start; 0 for everything else. A rule of thumb only:
 *  VASP's advice is to start above the expected moment (1.2-1.5x experiment). */
export const START_MOMENT = { Cr: 4, Mn: 5, Fe: 5, Co: 4, Ni: 3, V: 3, Cu: 1, Ru: 2, Rh: 1, Mo: 2, Ce: 1, Pr: 2, Nd: 3, Pm: 4, Sm: 5, Eu: 7, Gd: 7, Tb: 6, Dy: 5, Ho: 4, Er: 3, Tm: 2, Yb: 1 };

/** Signs for each site: 'fm' all +1; 'layers-a|b|c' alternate between successive planes of the magnetic
 *  sites along that lattice vector (A-type layering); sites with zero moment get 0. */
export function magmomSigns(p, moments, pattern = 'fm') {
  const mag = p.sites.map((s, i) => (moments[s] ? i : -1)).filter(i => i >= 0);
  const signs = p.sites.map(s => (moments[s] ? 1 : 0));
  const m = pattern.match(/^layers-([abc])$/);
  if (m) {
    const k = 'abc'.indexOf(m[1]);
    const tol = 1e-2;   // atoms of one plane in a relaxed structure differ slightly in height
    const coord = i => { const x = ((p.positions[i][k] % 1) + 1) % 1; return x > 1 - tol ? x - 1 : x; };
    const planes = [];
    for (const x of mag.map(coord).sort((a, b) => a - b)) if (!planes.length || x - planes[planes.length - 1] > tol) planes.push(x);
    const plane = x => planes.findIndex(q => Math.abs(x - q) <= tol);
    for (const i of mag) signs[i] = plane(coord(i)) % 2 ? -1 : 1;
    signs.planes = planes.length;
  }
  return signs;
}

/** MAGMOM text from per-species moments and per-site signs; noncollinear writes (0, 0, m) per site. */
export function magmomLine(p, moments, signs, noncollinear = false) {
  const vals = p.sites.map((s, i) => (moments[s] || 0) * (signs[i] ?? 1));
  const flat = noncollinear ? vals.flatMap(v => [0, 0, v]) : vals;
  const total = vals.reduce((a, b) => a + b, 0);
  return { line: compressValues(flat.map(v => (Object.is(v, -0) ? 0 : v))), count: flat.length, total };
}
