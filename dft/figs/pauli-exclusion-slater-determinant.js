/* Figures for Lecture 5 (pauli-exclusion-slater-determinant).
   helium:  helium's ground-state energy: electrons treated as non-interacting, their repulsion added
            as an average, and experiment (values from MIT 5.61, Lecture 22).
   pair:    two electrons in a one-dimensional box with orbitals ψ₁ and ψ₂: |Ψ(x₁, x₂)|² for the plain
            product, the symmetric and the antisymmetric combination. The antisymmetric one vanishes
            on the diagonal x₁ = x₂, where two same-spin electrons would meet.
   storage: how many numbers it takes to store Ψ(r₁, …, r_N) on a grid, against the density n(r). */

/* ---------------- helium: three energies ---------------- */

export const HELIUM = [
  { label: 'Electrons as if non-interacting', e: -108.8, note: '−Z² hartree = −4 Ha' },
  { label: 'Their repulsion added as an average', e: -74.8, note: '+5Z/8 Ha = +34 eV' },
  { label: 'Experiment', e: -79.0, note: '24.6 + 54.4 eV to remove both' },
];

function heliumSVG() {
  const L = 270, R = 600, T = 30, RH = 62, e0 = -115, e1 = -60;
  const X = e => L + (e - e0) / (e1 - e0) * (R - L);
  let g = '';
  const AX = T + RH * 3 + 46;
  for (let e = -110; e <= -60; e += 10) g += `<line class="grid" x1="${X(e)}" y1="${T - 10}" x2="${X(e)}" y2="${AX - 14}"/><text class="tick" x="${X(e)}" y="${AX}" text-anchor="middle">${e}</text>`;
  HELIUM.forEach((h, i) => {
    const y = T + i * RH + RH / 2;
    g += `<g><title>${h.label}: ${h.e} eV</title>
      <text class="row-l" x="${L - 14}" y="${y - 2}" text-anchor="end">${h.label}</text>
      <text class="row-n" x="${L - 14}" y="${y + 15}" text-anchor="end">${h.note}</text>
      <line class="stem" x1="${X(h.e)}" y1="${y}" x2="${R}" y2="${y}"/>
      <circle class="dot${i === 2 ? ' exp' : ''}" cx="${X(h.e)}" cy="${y}" r="8"/>
      <text class="val" x="${X(h.e)}" y="${y - 14}" text-anchor="middle">${h.e.toFixed(1)} eV</text></g>`;
  });
  const y0 = T + RH / 2, y2 = T + 2 * RH + RH / 2;
  g += `<path class="gap" d="M${X(-108.8)} ${y2 + 14} V${y2 + 20} H${X(-79.0)} V${y2 + 14}"/><text class="gap-l" x="${(X(-108.8) + X(-79)) / 2}" y="${y2 + 34}" text-anchor="middle">30 eV: six covalent bonds' worth</text>`;
  return `<svg class="he-svg" viewBox="0 0 640 ${AX + 24}" role="img" aria-label="Helium ground-state energy: minus 108.8 eV without electron repulsion, minus 74.8 eV with it added as an average, minus 79.0 eV measured">
    ${g}
    <text class="axl" x="${(L + R) / 2}" y="${AX + 18}" text-anchor="middle">ground-state energy of helium (eV)</text>
  </svg>`;
}

/* ---------------- pair: two electrons in a box ---------------- */

const phi = (n, x) => Math.SQRT2 * Math.sin(n * Math.PI * x);
/** Two-electron spatial wavefunction on the unit box: 'product', 'sym' or 'anti'. */
export function pairPsi(mode, x1, x2) {
  const a = phi(1, x1) * phi(2, x2), b = phi(2, x1) * phi(1, x2);
  return mode === 'product' ? a : mode === 'sym' ? (a + b) / Math.SQRT2 : (a - b) / Math.SQRT2;
}
/** Probability that the two electrons are closer than d (unit box), by a midpoint grid. */
export function closeProb(mode, d = 0.1, n = 300) {
  let p = 0;
  const h = 1 / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const x1 = (i + 0.5) * h, x2 = (j + 0.5) * h;
    if (Math.abs(x1 - x2) < d) p += pairPsi(mode, x1, x2) ** 2 * h * h;
  }
  return p;
}

const MODES = { product: 'ψ₁(x₁) ψ₂(x₂)', sym: 'symmetric', anti: 'antisymmetric' };

function pairSVG(mode) {
  const G = 36, S = 230, x0 = 70, y0 = 20, c = S / G;
  let max = 0;
  const v = [];
  for (let i = 0; i < G; i++) for (let j = 0; j < G; j++) {
    const val = pairPsi(mode, (i + 0.5) / G, (j + 0.5) / G) ** 2;
    v.push(val); max = Math.max(max, val);
  }
  let cells = '';
  for (let i = 0; i < G; i++) for (let j = 0; j < G; j++) {
    const t = v[i * G + j] / max;
    // one hue, light to dark: magnitude of |Ψ|²
    const l = (97 - 62 * t).toFixed(1);
    cells += `<rect x="${(x0 + i * c).toFixed(1)}" y="${(y0 + (G - 1 - j) * c).toFixed(1)}" width="${(c + 0.4).toFixed(2)}" height="${(c + 0.4).toFixed(2)}" fill="hsl(214 62% ${l}%)"/>`;
  }
  const p = closeProb(mode);
  return `<svg class="pair-svg" viewBox="0 0 640 290" role="img" aria-label="Map of the two-electron probability density for the ${MODES[mode]} state; probability that the electrons are within 0.1 L of each other: ${p.toFixed(3)}">
    ${cells}
    <rect class="frame-r" x="${x0}" y="${y0}" width="${S}" height="${S}"/>
    <line class="diag" x1="${x0}" y1="${y0 + S}" x2="${x0 + S}" y2="${y0}"/>
    <text class="diag-l" x="${x0 + S - 6}" y="${y0 + 16}" text-anchor="end">x₁ = x₂</text>
    <text class="axl" x="${x0 + S / 2}" y="${y0 + S + 28}" text-anchor="middle">position of electron 1, x₁</text>
    <text class="axl" x="${x0 - 30}" y="${y0 + S / 2}" text-anchor="middle" transform="rotate(-90 ${x0 - 30} ${y0 + S / 2})">position of electron 2, x₂</text>
    <text class="tick" x="${x0}" y="${y0 + S + 14}" text-anchor="middle">0</text><text class="tick" x="${x0 + S}" y="${y0 + S + 14}" text-anchor="middle">L</text>
    <text class="lbl" x="${x0 + S + 40}" y="${y0 + 20}">|Ψ(x₁, x₂)|², ${MODES[mode]}</text>
    <text class="tick" x="${x0 + S + 40}" y="${y0 + 44}">darker = more likely</text>
    <text class="lbl" x="${x0 + S + 40}" y="${y0 + 90}">P(|x₁ − x₂| &lt; 0.1 L) = ${p.toFixed(3)}</text>
    <text class="tick" x="${x0 + S + 40}" y="${y0 + 112}">chance the two electrons are close</text>
  </svg>`;
}

export function pair(fig) {
  const body = fig.querySelector('.fig-body');
  const panel = document.createElement('div');
  panel.className = 'fig-controls';
  panel.innerHTML = `<span class="seg">${Object.entries(MODES).map(([k, t]) => `<button type="button" data-m="${k}"${k === 'anti' ? ' class="on"' : ''}>${t}</button>`).join('')}</span><span class="readout" aria-live="polite"></span>`;
  body.after(panel);
  const out = panel.querySelector('.readout');
  const draw = mode => {
    body.innerHTML = pairSVG(mode);
    out.textContent = mode === 'anti' ? 'Zero all along x₁ = x₂: same-spin electrons never meet.' : mode === 'sym' ? 'Largest along x₁ = x₂: electrons pile up together.' : 'Not symmetric under swapping the labels 1 and 2.';
  };
  panel.addEventListener('click', e => {
    const b = e.target.closest('[data-m]');
    if (!b) return;
    panel.querySelectorAll('[data-m]').forEach(x => x.classList.toggle('on', x === b));
    draw(b.dataset.m);
  });
  draw('anti');
}

/* ---------------- storage: Ψ against n(r) on a grid ---------------- */

/** log10 of the number of values to store Ψ(r₁, …, r_N) with g points per coordinate (spin ignored). */
export const psiLog10 = (N, g) => 3 * N * Math.log10(g);
const BYTES = 16;   // one complex number in double precision

const fmtPow = lg => {
  const e = Math.floor(lg), m = 10 ** (lg - e);
  return `${m.toFixed(1)} × 10<sup>${e}</sup>`;
};
const fmtBytes = b => {
  const units = [['B', 1], ['kB', 1e3], ['MB', 1e6], ['GB', 1e9], ['TB', 1e12], ['PB', 1e15]];
  if (b >= 1e18) return `${fmtPow(Math.log10(b))} bytes`;
  let u = units[0];
  for (const x of units) if (b >= x[1]) u = x;
  return `${+(b / u[1]).toPrecision(3)} ${u[0]}`;
};

function storageSVG(N, g) {
  const lgPsi = psiLog10(N, g), lgRho = 3 * Math.log10(g);
  const W = 520, x0 = 90, max = Math.max(30, Math.ceil(lgPsi / 10) * 10);
  const bar = lg => Math.max(6, lg / max * W);
  return `<svg class="store-svg" viewBox="0 0 640 230" role="img" aria-label="Storing the wavefunction of ${N} electrons with ${g} points per coordinate needs 10 to the ${lgPsi.toFixed(0)} numbers; the density needs ${g ** 3}">
    <text class="lbl" x="${x0}" y="34">Ψ(r<tspan baseline-shift="sub" font-size="9">1</tspan>, …, r<tspan baseline-shift="sub" font-size="9">N</tspan>), N = ${N}: ${g}<tspan baseline-shift="super" font-size="9">${3 * N}</tspan> values</text>
    <rect class="b-psi" x="${x0}" y="46" width="${bar(lgPsi)}" height="34" rx="4"/>
    <text class="big-v" x="${x0 + 8}" y="69">${fmtPow(lgPsi).replace(/<\/?sup>/g, m => (m === '<sup>' ? '^' : '')).replace(/\^(\d+)/, (_, d) => d.split('').map(c => '⁰¹²³⁴⁵⁶⁷⁸⁹'[c]).join(''))} values</text>
    <text class="lbl" x="${x0}" y="122">n(r): ${g}³ values, for any N</text>
    <rect class="b-rho" x="${x0}" y="134" width="${bar(lgRho)}" height="34" rx="4"/>
    <text class="tick" x="${x0}" y="196">bar length: number of digits (log₁₀ of the count); scale 0 to ${max} digits</text>
  </svg>`;
}

export function storage(fig) {
  const body = fig.querySelector('.fig-body');
  const panel = document.createElement('div');
  panel.className = 'fig-panel';
  panel.innerHTML = `<label>N <input type="range" min="1" max="30" step="1" value="8" aria-label="Number of electrons"></label>
    <p>Grid points per coordinate <span class="seg">${[10, 30, 100].map(g => `<button type="button" data-g="${g}"${g === 10 ? ' class="on"' : ''}>${g}</button>`).join('')}</span></p>
    <p class="readout" aria-live="polite"></p>`;
  body.after(panel);
  const out = panel.querySelector('.readout');
  let N = 8, g = 10;
  const draw = () => {
    body.innerHTML = storageSVG(N, g);
    const lg = psiLog10(N, g) + Math.log10(BYTES);
    out.innerHTML = `Ψ for N = ${N}: <b>${fmtBytes(10 ** lg)}</b><br>n(r): <b>${fmtBytes(g ** 3 * 8)}</b><br><span class="small">16 bytes per complex value of Ψ, 8 per real value of n; spin ignored.</span>`;
  };
  panel.querySelector('input').addEventListener('input', e => { N = +e.target.value; draw(); });
  panel.addEventListener('click', e => {
    const b = e.target.closest('[data-g]');
    if (!b) return;
    g = +b.dataset.g;
    panel.querySelectorAll('[data-g]').forEach(x => x.classList.toggle('on', x === b));
    draw();
  });
  draw();
}

export const snapshots = { helium: heliumSVG, pair: () => pairSVG('anti'), storage: () => storageSVG(8, 10) };
