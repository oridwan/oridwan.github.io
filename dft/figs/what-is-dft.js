/* Figures for Lecture 0 (what-is-dft).
   carbon: energies of eight carbon frameworks above graphite (data: Ridwan et al. 2026, Fig. 7).
   wall:   Kohn's estimate of the numbers needed to store a many-electron wavefunction.
   run:    the life of a VASP run as two nested loops; click a box or step through a run.
   units:  an energy-unit converter built on the CODATA 2022 values and the exact SI constants. */

/* ---------------- the hook: carbon frameworks above graphite ---------------- */

// Relative DFT (r2SCAN) energies above graphite in eV/atom, Ridwan et al. 2026, Fig. 7.
// known: previously reported structures (marked with asterisks in the paper).
export const CARBON = [
  { name: 'NCG1-cP192', e: 0.197, known: false },
  { name: 'NCG2-cP108', e: 0.201, known: false },
  { name: 'mct-cI192', e: 0.211, known: true },
  { name: 'NCG3-cP192', e: 0.221, known: false },
  { name: 'known-cP176', e: 0.226, known: true },
  { name: 'nku-a-cI384', e: 0.239, known: true },
  { name: 'known-cP216', e: 0.240, known: true },
  { name: 'NCG4-cI144', e: 0.247, known: false },
];

function carbonSVG() {
  const L = 150, R = 560, T = 34, RH = 27, e0 = 0.19, e1 = 0.25;
  const X = e => L + (e - e0) / (e1 - e0) * (R - L);
  const B = T + RH * CARBON.length;
  let g = '';
  for (let e = e0; e <= e1 + 1e-9; e += 0.01) {
    g += `<line class="grid" x1="${X(e)}" y1="${T - 8}" x2="${X(e)}" y2="${B}"/><text class="tick" x="${X(e)}" y="${B + 16}" text-anchor="middle">${e.toFixed(2)}</text>`;
  }
  CARBON.forEach((c, i) => {
    const y = T + RH * i + RH / 2;
    g += `<g><title>${c.name}: ${c.e.toFixed(3)} eV/atom above graphite (${c.known ? 'previously reported' : 'new'})</title>
      <text class="row-l${c.known ? '' : ' new'}" x="${L - 12}" y="${y + 4}" text-anchor="end">${c.name}</text>
      <line class="stem" x1="${L}" y1="${y}" x2="${X(c.e) - 7}" y2="${y}"/>
      <circle class="dot${c.known ? '' : ' new'}" cx="${X(c.e)}" cy="${y}" r="6.5"/>
      <text class="val" x="${X(c.e) + 12}" y="${y + 4}">${c.e.toFixed(3)}</text></g>`;
  });
  // the gap between the lowest new structure and the previous lowest
  const ya = T + RH / 2, yb = T + RH * 2 + RH / 2, xg = X(0.211) + 52;
  g += `<path class="gap" d="M${xg - 5} ${ya} H${xg} V${yb} H${xg - 5}"/><text class="gap-l" x="${xg + 8}" y="${(ya + yb) / 2 + 4}">0.014 eV/atom lower</text>`;
  const ly = 14;
  g += `<circle class="dot new" cx="${L}" cy="${ly}" r="5.5"/><text class="leg" x="${L + 10}" y="${ly + 4}">new in that work</text>
    <circle class="dot" cx="${L + 140}" cy="${ly}" r="5.5"/><text class="leg" x="${L + 150}" y="${ly + 4}">previously reported</text>`;
  return `<svg class="dots-svg" viewBox="0 0 640 ${B + 40}" role="img" aria-label="Dot chart of eight carbon frameworks: energies above graphite from 0.197 to 0.247 eV per atom; the two lowest are new">
    ${g}<text class="axl" x="${(L + R) / 2}" y="${B + 34}" text-anchor="middle">Energy above graphite (eV/atom)</text></svg>`;
}

/* ---------------- the exponential wall (Kohn, Nobel lecture, section II.B) ---------------- */

/** log10 of M = p^(3N), Kohn's count of parameters for an N-electron wavefunction. */
export const wallLog10 = (p, N) => 3 * N * Math.log10(p);
/** Kohn's largest feasible N for M parameters: N = log M / (3 log p). */
export const wallMaxN = (p, log10M = 9) => log10M / (3 * Math.log10(p));

const WL = 78, WR = 620, WT = 16, WB = 258, YMAX = 150;
const wx = N => WL + (N - 1) / 99 * (WR - WL);
const wy = v => WB - Math.min(v, YMAX) / YMAX * (WB - WT);

function wallSVG(p, N) {
  let g = '';
  for (let v = 0; v <= YMAX; v += 25) g += `<line class="grid" x1="${WL}" y1="${wy(v)}" x2="${WR}" y2="${wy(v)}"/><text class="tick" x="${WL - 8}" y="${wy(v) + 4}" text-anchor="end">10${sup(v)}</text>`;
  for (const n of [1, 20, 40, 60, 80, 100]) g += `<text class="tick" x="${wx(n)}" y="${WB + 16}" text-anchor="middle">${n}</text>`;
  const top = Math.min(100, YMAX / (3 * Math.log10(p)));          // where the line leaves the plot
  const yPsi = wallLog10(p, N), yRho = 3 * Math.log10(p), nMax = wallMaxN(p);
  const lab = Math.min(28, top * 0.4);                              // label position along the line
  const lx = wx(lab), ly = wy(wallLog10(p, lab));
  const ang = Math.atan2(wy(wallLog10(p, top)) - wy(wallLog10(p, 1)), wx(top) - wx(1)) * 180 / Math.PI;
  return `<svg class="wall-svg" viewBox="0 0 640 296" role="img" aria-label="Parameters needed to describe a wavefunction of N electrons rise as p to the power 3N; a function of three coordinates needs p cubed for any N">
    ${g}
    <line class="ax" x1="${WL}" y1="${WB}" x2="${WR}" y2="${WB}"/><line class="ax" x1="${WL}" y1="${WT}" x2="${WL}" y2="${WB}"/>
    <line class="lim" x1="${WL}" y1="${wy(9)}" x2="${WR}" y2="${wy(9)}"/>
    <path class="rho" d="M${wx(1)} ${wy(yRho)} L${wx(100)} ${wy(yRho)}"/>
    <path class="psi" d="M${wx(1)} ${wy(wallLog10(p, 1))} L${wx(top)} ${wy(wallLog10(p, top))}"/>
    <text class="lab psi-l" transform="translate(${lx - 4} ${ly - 10}) rotate(${ang.toFixed(1)})">Ψ(r<tspan baseline-shift="sub" font-size="9">1</tspan>, …, r<tspan baseline-shift="sub" font-size="9">N</tspan>): p<tspan baseline-shift="super" font-size="9">3N</tspan></text>
    <circle class="mk psi-m" cx="${wx(nMax)}" cy="${wy(9)}" r="4"/>
    <line class="vline" x1="${wx(nMax)}" y1="${wy(9) - 6}" x2="${wx(nMax)}" y2="${wy(9) - 30}"/>
    <text class="lim-l" x="${wx(nMax) - 12}" y="${wy(9) - 36}">N ≈ ${nMax.toFixed(1)}</text>
    <g transform="translate(${WR - 250} ${wy(52)})">
      <line class="lim" x1="0" y1="0" x2="26" y2="0"/><text class="lim-l" x="34" y="4">10⁹: an optimistic practical limit</text>
      <line class="rho" x1="0" y1="22" x2="26" y2="22"/><text class="lab rho-l" x="34" y="26">n(r): p³, for any N</text>
    </g>
    <line class="vline" x1="${wx(N)}" y1="${WT}" x2="${wx(N)}" y2="${WB}"/>
    ${yPsi <= YMAX ? `<circle class="mk psi-m" cx="${wx(N)}" cy="${wy(yPsi)}" r="6"/>` : ''}
    <circle class="mk rho-m" cx="${wx(N)}" cy="${wy(yRho)}" r="6"/>
    <text class="axl" x="${(WL + WR) / 2}" y="${WB + 34}" text-anchor="middle">Number of electrons N</text>
    <text class="axl" x="16" y="${(WT + WB) / 2}" text-anchor="middle" transform="rotate(-90 16 ${(WT + WB) / 2})">Parameters needed</text>
  </svg>`;
}
const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
const sup = v => String(v).split('').map(c => SUP[c]).join('');

export function wall(fig) {
  const body = fig.querySelector('.fig-body');
  const panel = document.createElement('div');
  panel.className = 'fig-panel';
  panel.innerHTML = `<label>N <input type="range" min="1" max="100" step="1" value="100" aria-label="Number of electrons"></label>
    <p>Electrons <span class="seg">${[[2, 'H₂'], [6, '6'], [14, 'Si atom'], [100, '100']].map(([n, t]) => `<button type="button" data-n="${n}">${t}</button>`).join('')}</span></p>
    <p>Parameters per coordinate, p <span class="seg">${[3, 5, 10].map(v => `<button type="button" data-p="${v}"${v === 3 ? ' class="on"' : ''}>${v}</button>`).join('')}</span></p>
    <p class="readout" aria-live="polite"></p>`;
  body.after(panel);
  const slider = panel.querySelector('input');
  const out = panel.querySelector('.readout');
  let p = 3, N = 100;
  function draw() {
    body.innerHTML = wallSVG(p, N);
    slider.value = N;
    panel.querySelectorAll('[data-n]').forEach(b => b.classList.toggle('on', +b.dataset.n === N));
    const lg = wallLog10(p, N);
    out.innerHTML = `<b>N = ${N}</b>: Ψ needs ${p}<sup>${3 * N}</sup> ≈ <b>10<sup>${Math.floor(lg)}</sup></b> parameters; `
      + `n(r) needs ${p}³ = <b>${p ** 3}</b>.<br>With 10⁹ parameters, Ψ reaches only N ≈ <b>${wallMaxN(p).toFixed(1)}</b>.`;
  }
  panel.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.n) N = +b.dataset.n;
    if (b.dataset.p) { p = +b.dataset.p; panel.querySelectorAll('[data-p]').forEach(o => o.classList.toggle('on', o === b)); }
    draw();
  });
  slider.addEventListener('input', () => { N = +slider.value; draw(); });
  draw();
}

/* ---------------- the life of a VASP run ---------------- */

const BW = 128, BH = 58;
// step → [x, y, title, subtitle]
const BOX = {
  read:      [10, 60, 'Read inputs', 'INCAR, POSCAR, …'],
  guess:     [160, 60, 'Starting guess', 'orbitals, density'],
  solve:     [310, 60, 'Solve Kohn–Sham', 'orbitals, eigenvalues'],
  density:   [460, 60, 'New density', 'mix with the old one'],
  converged: [610, 60, 'Converged?', 'compare with EDIFF'],
  forces:    [610, 222, 'Energy, forces', 'and stress'],
  ionic:     [385, 222, 'Move nuclei?', 'NSW, IBRION'],
  write:     [160, 222, 'Write outputs', 'OSZICAR, OUTCAR, …'],
};

function runSVG() {
  const box = ([x, y, t1, t2], id) => `<g class="box" data-step="${id}" tabindex="0" role="button" aria-label="${t1}">
      <rect x="${x}" y="${y}" width="${BW}" height="${BH}" rx="7"/>
      <text class="t1" x="${x + BW / 2}" y="${y + 25}" text-anchor="middle">${t1}</text>
      <text class="t2" x="${x + BW / 2}" y="${y + 43}" text-anchor="middle">${t2}</text></g>`;
  return `<svg class="run-svg" viewBox="0 0 760 300" role="img" aria-label="Flow chart of a VASP run: an electronic loop inside an ionic loop">
    <defs><marker id="run-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" class="head"/></marker></defs>
    <rect class="loop-i" x="294" y="8" width="460" height="288" rx="12"/>
    <text class="loop-lbl" x="306" y="288">Ionic loop</text>
    <rect class="loop-e" x="302" y="16" width="444" height="118" rx="10"/>
    <text class="loop-lbl" x="310" y="31">Electronic (SCF) loop</text>
    <path class="arrow" d="M138 89 H158"/>
    <path class="arrow" d="M288 89 H308"/>
    <path class="arrow" d="M438 89 H458"/>
    <path class="arrow" d="M588 89 H608"/>
    <path class="arrow" d="M674 60 C674 26, 374 26, 374 58"/>
    <text class="lbl" x="524" y="52" text-anchor="middle">not yet: next electronic step</text>
    <path class="arrow" d="M674 118 V220"/>
    <text class="lbl" x="682" y="174">yes</text>
    <path class="arrow" d="M610 251 H515"/>
    <path class="arrow" d="M449 222 C449 176, 374 174, 374 120"/>
    <text class="lbl" x="456" y="180">yes: next ionic step</text>
    <path class="arrow" d="M385 251 H290"/>
    <text class="lbl" x="337" y="243" text-anchor="middle">no</text>
    ${Object.entries(BOX).map(([id, b]) => box(b, id)).join('')}
  </svg>`;
}

// Illustrative sequences: three electronic steps per ionic step.
const SCF = ['solve', 'density', 'converged'];
const SEQ = {
  static: ['read', 'guess', ...SCF, ...SCF, ...SCF, 'forces', 'ionic', 'write'],
  relax: ['read', 'guess', ...SCF, ...SCF, ...SCF, 'forces', 'ionic', ...SCF, ...SCF, ...SCF, 'forces', 'ionic', 'write'],
};

function describe(mode, i) {
  const seq = SEQ[mode];
  let el = 0, ion = 1;
  for (let k = 0; k <= i; k++) {
    if (seq[k] === 'solve') el++;
    if (seq[k] === 'ionic' && k < i) { ion++; el = 0; }
  }
  const s = seq[i];
  if (SCF.includes(s)) return `Ionic step ${ion} · electronic step ${el}` + (s === 'converged' ? (seq[i + 1] === 'solve' ? ' · not yet converged' : ' · converged') : '');
  if (s === 'ionic') {
    if (seq[i + 1] !== 'write') return `Ionic step ${ion} · move the nuclei`;
    return mode === 'static' ? 'NSW = 0 · the nuclei are not moved' : `Ionic step ${ion} · EDIFFG met or NSW reached · stop`;
  }
  return '';
}

export function run(fig) {
  const body = fig.querySelector('.fig-body');
  const slide = fig.closest('.deck-slide');
  const steps = new Map([...slide.querySelectorAll('.run-steps > li')].map(li => [li.dataset.step, li]));
  const boxes = new Map([...fig.querySelectorAll('.box')].map(g => [g.dataset.step, g]));
  const detail = document.createElement('div');
  detail.className = 'run-detail';
  detail.setAttribute('aria-live', 'polite');

  const controls = document.createElement('div');
  controls.className = 'fig-controls';
  controls.innerHTML = `<span class="seg"><button type="button" data-mode="static" class="on">Static run</button><button type="button" data-mode="relax">Relaxation</button></span>
    <button type="button" class="btn-step" data-go="-1" aria-label="Previous step">◀</button>
    <button type="button" class="btn-step play">Step through</button>
    <button type="button" class="btn-step" data-go="1" aria-label="Next step">▶</button>
    <span class="run-status" aria-live="polite"></span>`;
  body.after(controls, detail);
  const status = controls.querySelector('.run-status');
  const play = controls.querySelector('.play');

  let mode = 'static', i = -1, timer = 0;
  function select(step) {
    boxes.forEach((g, k) => g.classList.toggle('on', k === step));
    const li = steps.get(step);
    detail.innerHTML = li ? li.innerHTML : '';
  }
  function goTo(k) {
    const seq = SEQ[mode];
    i = Math.max(0, Math.min(seq.length - 1, k));
    select(seq[i]);
    const what = describe(mode, i);
    status.textContent = `Step ${i + 1} of ${seq.length}` + (what ? ` · ${what}` : '');
  }
  function stop() { clearInterval(timer); timer = 0; play.textContent = 'Step through'; }
  play.addEventListener('click', () => {
    if (timer) { stop(); return; }
    if (i >= SEQ[mode].length - 1) i = -1;
    play.textContent = 'Pause';
    goTo(i + 1);
    timer = setInterval(() => { if (i >= SEQ[mode].length - 1) stop(); else goTo(i + 1); }, 1100);
  });
  controls.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.go) { stop(); goTo(i + Number(b.dataset.go)); }
    if (b.dataset.mode) {
      stop();
      mode = b.dataset.mode;
      controls.querySelectorAll('[data-mode]').forEach(x => x.classList.toggle('on', x === b));
      goTo(0);
    }
  });
  fig.querySelector('.run-svg').addEventListener('click', e => {
    const g = e.target.closest('.box');
    if (!g) return;
    stop();
    i = -1;
    select(g.dataset.step);
    status.textContent = '';
  });
  fig.querySelector('.run-svg').addEventListener('keydown', e => {
    const g = e.target.closest('.box');
    if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); g.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
  });
  select('read');
}

/* ---------------- energy units ---------------- */

// Exact SI defining constants and CODATA 2022 values (NIST).
const E_CHARGE = 1.602176634e-19;   // C, exact
const N_A = 6.02214076e23;          // 1/mol, exact
const K_B = 1.380649e-23;           // J/K, exact
const H = 6.62607015e-34;           // J s, exact
const C = 299792458;                // m/s, exact
const HARTREE_EV = 27.211386245981; // CODATA 2022
const RYDBERG_EV = 13.605693122990; // CODATA 2022

// energy of one unit, in eV
export const UNITS = [
  { id: 'Ha', label: 'hartree', eV: HARTREE_EV },
  { id: 'Ry', label: 'rydberg', eV: RYDBERG_EV },
  { id: 'eV', label: 'eV', eV: 1 },
  { id: 'meV', label: 'meV', eV: 1e-3 },
  { id: 'kJmol', label: 'kJ/mol', eV: 1000 / (E_CHARGE * N_A) },
  { id: 'K', label: 'K (energy ÷ k<sub>B</sub>)', eV: K_B / E_CHARGE },
  { id: 'cm', label: 'cm<sup>−1</sup> (energy ÷ hc)', eV: H * C * 100 / E_CHARGE },
];

const fmt = x => (x === 0 ? '0' : Math.abs(x) >= 1e7 || Math.abs(x) < 1e-4
  ? x.toExponential(6).replace('e+', ' × 10^').replace('e-', ' × 10^−')
  : x.toLocaleString('en-US', { maximumSignificantDigits: 8 }));

export function units(fig) {
  const conv = fig.querySelector('.conv-slot');
  conv.className = 'conv';
  conv.innerHTML = `<p><b>Convert</b></p><p class="row"><input type="number" value="1" step="any" aria-label="Value">
    <select aria-label="Unit">${UNITS.map(u => `<option value="${u.id}"${u.id === 'eV' ? ' selected' : ''}>${u.label.replace(/<[^>]+>/g, '')}</option>`).join('')}</select></p>
    <ul class="conv-out" aria-live="polite"></ul>`;
  const input = conv.querySelector('input');
  const select = conv.querySelector('select');
  const out = conv.querySelector('.conv-out');
  function update() {
    const v = Number(input.value);
    const from = UNITS.find(u => u.id === select.value);
    if (!Number.isFinite(v)) { out.innerHTML = ''; return; }
    const ev = v * from.eV;
    out.innerHTML = UNITS.filter(u => u !== from)
      .map(u => `<li><b>${fmt(ev / u.eV).replace(/\^(−?\d+)/, '<sup>$1</sup>')}</b> ${u.label}</li>`).join('');
  }
  input.addEventListener('input', update);
  select.addEventListener('change', update);
  update();
}

export const snapshots = { carbon: carbonSVG, wall: () => wallSVG(3, 100), run: runSVG };
