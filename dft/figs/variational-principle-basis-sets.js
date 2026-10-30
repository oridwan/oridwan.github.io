/* Figures for Lecture 3 (variational-principle-basis-sets).
   trial:  one-parameter Gaussian trial functions, e^{−αx²/2} for the harmonic oscillator and
           e^{−αr²} for the hydrogen atom, with E(α) against the exact ground-state energy.
   mixing: two coupled basis functions, H = [[1, t], [t, 2]] eV: the levels repel as t grows.
   ritz:   Rayleigh–Ritz in a growing basis of box states sin(nπx) for a particle in a box with an
           off-centre harmonic well, V(x) = 800 E₁ (x − 0.38)²; energies in units of E₁, the
           ground-state energy of the empty box. */

/* ---------------- shared numerics ---------------- */

/** Eigenvalues (ascending) and eigenvectors of a real symmetric matrix, by cyclic Jacobi rotations. */
export function eigh(A) {
  const n = A.length, a = A.map(r => r.slice()), v = A.map((r, i) => r.map((_, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += a[p][q] ** 2;
    if (off < 1e-24) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      if (a[p][q] === 0) continue;
      const th = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      const t = (th >= 0 ? 1 : -1) / (Math.abs(th) + Math.sqrt(th * th + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) { const x = a[k][p], y = a[k][q]; a[k][p] = c * x - s * y; a[k][q] = s * x + c * y; }
      for (let k = 0; k < n; k++) { const x = a[p][k], y = a[q][k]; a[p][k] = c * x - s * y; a[q][k] = s * x + c * y; }
      for (let k = 0; k < n; k++) { const x = v[k][p], y = v[k][q]; v[k][p] = c * x - s * y; v[k][q] = s * x + c * y; }
    }
  }
  const idx = [...Array(n).keys()].sort((i, j) => a[i][i] - a[j][j]);
  return { values: idx.map(i => a[i][i]), vectors: idx.map(i => v.map(r => r[i])) };
}

/* ---------------- trial: E(α) for one-parameter Gaussian families ---------------- */

export const TRIALS = {
  // ħ = m = ω = 1: ⟨T⟩ = α/4, ⟨V⟩ = 1/(4α); exact E₀ = ħω/2, reached at α = 1
  ho: { label: 'Harmonic oscillator', unit: 'ħω', E0: 0.5, range: [0.08, 6], eRange: [0, 3],
        E: a => a / 4 + 1 / (4 * a), best: 1,
        psi: (a, x) => (a / Math.PI) ** 0.25 * Math.exp(-a * x * x / 2), exact: x => Math.PI ** -0.25 * Math.exp(-x * x / 2),
        xr: [0, 3.5], xlab: 'x (oscillator length)' },
  // hydrogen atom, Hartree atomic units: ⟨T⟩ = 3α/2, ⟨V⟩ = −2√(2α/π); exact E₀ = −1/2 Ha
  h: { label: 'Hydrogen atom', unit: 'Ha', E0: -0.5, range: [0.03, 3], eRange: [-0.6, 0.8],
       E: a => 1.5 * a - 2 * Math.sqrt(2 * a / Math.PI), best: 8 / (9 * Math.PI),
       psi: (a, r) => (2 * a / Math.PI) ** 0.75 * Math.exp(-a * r * r), exact: r => Math.exp(-r) / Math.sqrt(Math.PI),
       xr: [0, 4], xlab: 'r (bohr)' },
};

function trialSVG(key, alpha) {
  const t = TRIALS[key];
  const L = 64, R = 330, T = 20, B = 250;
  const [a0, a1] = t.range, [e0, e1] = t.eRange;
  const X = a => L + Math.log(a / a0) / Math.log(a1 / a0) * (R - L);
  const Y = e => B - (Math.min(e1, Math.max(e0, e)) - e0) / (e1 - e0) * (B - T);
  let d = '';
  for (let i = 0; i <= 200; i++) { const a = a0 * (a1 / a0) ** (i / 200); d += (i ? 'L' : 'M') + X(a).toFixed(1) + ' ' + Y(t.E(a)).toFixed(1); }
  let ticks = '';
  for (const a of [0.1, 0.3, 1, 3]) if (a >= a0 && a <= a1) ticks += `<text class="tick" x="${X(a)}" y="${B + 16}" text-anchor="middle">${a}</text>`;
  const step = (e1 - e0) / 4;
  for (let k = 0; k <= 4; k++) { const e = e0 + k * step; ticks += `<line class="grid" x1="${L}" y1="${Y(e)}" x2="${R}" y2="${Y(e)}"/><text class="tick" x="${L - 6}" y="${Y(e) + 4}" text-anchor="end">${+e.toFixed(2)}</text>`; }
  // right panel: trial and exact wavefunction
  const L2 = 390, R2 = 620, T2 = 40, B2 = 230, [x0, x1] = t.xr;
  const pmax = Math.max(t.exact(0), t.psi(alpha, 0)) * 1.1;
  const X2 = x => L2 + (x - x0) / (x1 - x0) * (R2 - L2), Y2 = p => B2 - p / pmax * (B2 - T2);
  const curve = f => { let s = ''; for (let i = 0; i <= 160; i++) { const x = x0 + (x1 - x0) * i / 160; s += (i ? 'L' : 'M') + X2(x).toFixed(1) + ' ' + Y2(f(x)).toFixed(1); } return s; };
  const E = t.E(alpha);
  return `<svg class="vp-svg" viewBox="0 0 640 290" role="img" aria-label="${t.label}: trial energy ${E.toFixed(3)} ${t.unit} at alpha ${alpha.toFixed(3)}, exact ${t.E0} ${t.unit}">
    ${ticks}
    <line class="ax" x1="${L}" y1="${B}" x2="${R}" y2="${B}"/><line class="ax" x1="${L}" y1="${T}" x2="${L}" y2="${B}"/>
    <line class="exact" x1="${L}" y1="${Y(t.E0)}" x2="${R}" y2="${Y(t.E0)}"/>
    <text class="lbl ex" x="${R}" y="${Y(t.E0) + 16}" text-anchor="end">exact E₀ = ${t.E0} ${t.unit}</text>
    <path class="curve" d="${d}"/>
    <circle class="mk" cx="${X(alpha)}" cy="${Y(E)}" r="7"/>
    <text class="axl" x="${(L + R) / 2}" y="${B + 32}" text-anchor="middle">width parameter α (log scale)</text>
    <text class="axl" x="16" y="${(T + B) / 2}" text-anchor="middle" transform="rotate(-90 16 ${(T + B) / 2})">E(α) (${t.unit})</text>
    <line class="ax" x1="${L2}" y1="${B2}" x2="${R2}" y2="${B2}"/>
    <path class="exact-psi" d="${curve(t.exact)}"/>
    <path class="trial-psi" d="${curve(x => t.psi(alpha, x))}"/>
    <text class="lbl ex" x="${R2}" y="${T2 - 18}" text-anchor="end">— exact ground state</text>
    <text class="lbl tr" x="${R2}" y="${T2}" text-anchor="end">— trial, this α</text>
    <text class="axl" x="${(L2 + R2) / 2}" y="${B2 + 32}" text-anchor="middle">${t.xlab}</text>
  </svg>`;
}

export function trial(fig) {
  const body = fig.querySelector('.fig-body');
  const panel = document.createElement('div');
  panel.className = 'fig-panel';
  panel.innerHTML = `<p><span class="seg"><button type="button" data-k="ho" class="on">Oscillator</button><button type="button" data-k="h">Hydrogen atom</button></span></p>
    <label>α <input type="range" min="0" max="1" step="0.002" aria-label="Width parameter alpha"></label>
    <p class="row"><button type="button" class="btn-step" data-act="best">Minimize</button></p>
    <p class="readout" aria-live="polite"></p>`;
  body.after(panel);
  const slider = panel.querySelector('input');
  const out = panel.querySelector('.readout');
  let key = 'ho', alpha = 0.3;
  const toA = u => { const [a0, a1] = TRIALS[key].range; return a0 * (a1 / a0) ** u; };
  const toU = a => { const [a0, a1] = TRIALS[key].range; return Math.log(a / a0) / Math.log(a1 / a0); };
  const draw = () => {
    const t = TRIALS[key], E = t.E(alpha), Emin = t.E(t.best);
    body.innerHTML = trialSVG(key, alpha);
    slider.value = toU(alpha);
    out.innerHTML = `E(α) = <b>${E.toFixed(4)} ${t.unit}</b>, exact E₀ = ${t.E0} ${t.unit}<br>Above exact by <b>${(E - t.E0).toFixed(4)} ${t.unit}</b><br>Best this family can do: ${Emin.toFixed(4)} ${t.unit}${key === 'h' ? ' (15% too high)' : ' (exact)'}`;
  };
  slider.addEventListener('input', () => { alpha = toA(+slider.value); draw(); });
  panel.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.k) {
      key = b.dataset.k;
      panel.querySelectorAll('[data-k]').forEach(x => x.classList.toggle('on', x === b));
      alpha = key === 'ho' ? 0.3 : 1.5;
    } else if (b.dataset.act === 'best') alpha = TRIALS[key].best;
    draw();
  });
  draw();
}

/* ---------------- mixing: two coupled basis functions ---------------- */

/** Eigenvalues of [[h11, t], [t, h22]]. */
export const twoLevel = (h11, h22, t) => {
  const m = (h11 + h22) / 2, d = Math.hypot((h22 - h11) / 2, t);
  return [m - d, m + d];
};

function mixingSVG(t) {
  const L = 70, R = 400, T = 20, B = 250, tmax = 1, e0 = -0.2, e1 = 3.2;
  const X = v => L + v / tmax * (R - L), Y = e => B - (e - e0) / (e1 - e0) * (B - T);
  let lo = '', hi = '';
  for (let i = 0; i <= 100; i++) { const v = tmax * i / 100, [a, b] = twoLevel(1, 2, v); lo += (i ? 'L' : 'M') + X(v).toFixed(1) + ' ' + Y(a).toFixed(1); hi += (i ? 'L' : 'M') + X(v).toFixed(1) + ' ' + Y(b).toFixed(1); }
  const [a, b] = twoLevel(1, 2, t);
  let g = '';
  for (const e of [0, 1, 2, 3]) g += `<line class="grid" x1="${L}" y1="${Y(e)}" x2="${R}" y2="${Y(e)}"/><text class="tick" x="${L - 6}" y="${Y(e) + 4}" text-anchor="end">${e}</text>`;
  for (const v of [0, 0.5, 1]) g += `<text class="tick" x="${X(v)}" y="${B + 16}" text-anchor="middle">${v}</text>`;
  // level diagram on the right
  // basis levels on the left, mixed levels on the right, as in a molecular-orbital diagram
  const lvL = (y, txt) => `<line class="exact" x1="470" y1="${Y(y)}" x2="510" y2="${Y(y)}"/><text class="tick" x="464" y="${Y(y) + 4}" text-anchor="end">${txt}</text>`;
  const lvR = (y, cls, txt) => `<line class="${cls}" x1="560" y1="${Y(y)}" x2="600" y2="${Y(y)}"/><text class="tick" x="606" y="${Y(y) + 4}">${txt}</text>`;
  return `<svg class="vp-svg" viewBox="0 0 640 290" role="img" aria-label="Two-level mixing: with coupling ${t.toFixed(2)} eV the levels are ${a.toFixed(3)} and ${b.toFixed(3)} eV">
    ${g}
    <line class="ax" x1="${L}" y1="${B}" x2="${R}" y2="${B}"/><line class="ax" x1="${L}" y1="${T}" x2="${L}" y2="${B}"/>
    <line class="exact" x1="${L}" y1="${Y(1)}" x2="${R}" y2="${Y(1)}"/><line class="exact" x1="${L}" y1="${Y(2)}" x2="${R}" y2="${Y(2)}"/>
    <path class="curve" d="${lo}"/><path class="curve hi" d="${hi}"/>
    <line class="vline" x1="${X(t)}" y1="${T}" x2="${X(t)}" y2="${B}"/>
    <circle class="mk" cx="${X(t)}" cy="${Y(a)}" r="6"/><circle class="mk hi" cx="${X(t)}" cy="${Y(b)}" r="6"/>
    <text class="axl" x="${(L + R) / 2}" y="${B + 32}" text-anchor="middle">coupling H₁₂ (eV)</text>
    <text class="axl" x="16" y="${(T + B) / 2}" text-anchor="middle" transform="rotate(-90 16 ${(T + B) / 2})">energy (eV)</text>
    <text class="lbl" x="535" y="${T + 6}" text-anchor="middle">levels at this H₁₂</text>
    ${lvL(1, 'H₁₁')}${lvL(2, 'H₂₂')}${lvR(a, 'curve', 'E₋')}${lvR(b, 'curve hi', 'E₊')}
    <line class="vline" x1="510" y1="${Y(1)}" x2="560" y2="${Y(a)}"/><line class="vline" x1="510" y1="${Y(2)}" x2="560" y2="${Y(b)}"/>
  </svg>`;
}

export function mixing(fig) {
  const body = fig.querySelector('.fig-body');
  const panel = document.createElement('div');
  panel.className = 'fig-panel';
  panel.innerHTML = `<label>H₁₂ <input type="range" min="0" max="1" step="0.01" value="0.2" aria-label="Coupling H12 in eV"></label><p class="readout" aria-live="polite"></p>`;
  body.after(panel);
  const out = panel.querySelector('.readout');
  let t = 0.2;
  const draw = () => {
    const [a, b] = twoLevel(1, 2, t);
    const { vectors } = eigh([[1, t], [t, 2]]);
    const c = vectors[0].map(v => v * Math.sign(vectors[0][0] || 1));
    body.innerHTML = mixingSVG(t);
    out.innerHTML = `E₋ = <b>${a.toFixed(4)} eV</b>, E₊ = <b>${b.toFixed(4)} eV</b><br>Lower state: c = (${c[0].toFixed(3)}, ${c[1].toFixed(3)})<br>E₋ is ${(1 - a).toFixed(4)} eV below H₁₁.`;
  };
  panel.querySelector('input').addEventListener('input', e => { t = +e.target.value; draw(); });
  draw();
}

/* ---------------- ritz: a growing basis of box states ---------------- */

export const RITZ = { V0: 800, x0: 0.38 };
const V = x => RITZ.V0 * (x - RITZ.x0) ** 2;
const NQ = 800;
let VCACHE = null;
function vElements(M) {
  if (!VCACHE || VCACHE.length < M) {
    const K = Math.max(M, 24), h = 1 / NQ;
    VCACHE = Array.from({ length: K }, () => new Array(K).fill(0));
    for (let i = 0; i < K; i++) for (let j = i; j < K; j++) {
      let s = 0;
      for (let k = 0; k <= NQ; k++) {
        const x = k * h, w = k === 0 || k === NQ ? 1 : k % 2 ? 4 : 2;
        s += w * 2 * Math.sin((i + 1) * Math.PI * x) * Math.sin((j + 1) * Math.PI * x) * V(x);
      }
      VCACHE[i][j] = VCACHE[j][i] = s * h / 3;
    }
  }
  return VCACHE;
}
/** Hamiltonian matrix in the first M box states, in units of E₁: H_ij = i² δ_ij + V_ij. */
export function ritzMatrix(M) {
  const v = vElements(M);
  return Array.from({ length: M }, (_, i) => Array.from({ length: M }, (_, j) => v[i][j] + (i === j ? (i + 1) ** 2 : 0)));
}
export function ritzSolve(M) {
  const { values, vectors } = eigh(ritzMatrix(M));
  const c = vectors[0];
  const sgn = c.reduce((s, v) => s + v, 0) >= 0 ? 1 : -1;
  return { E0: values[0], c: c.map(v => v * sgn) };
}

let REF = null;
const ref = () => (REF ??= ritzSolve(24));

function ritzSVG(M) {
  const { E0, c } = ritzSolve(M);
  const r = ref();
  // left: E0 against M, log of the error
  const L = 64, R = 300, T = 20, B = 240, MMAX = 16;
  const X = m => L + (m - 1) / (MMAX - 1) * (R - L);
  const lgmin = -10, lgmax = 2;
  const Y = err => B - (Math.max(lgmin, Math.min(lgmax, Math.log10(Math.max(err, 1e-12)))) - lgmin) / (lgmax - lgmin) * (B - T);
  let pts = '', g = '';
  for (let m = 1; m <= MMAX; m++) {
    const e = ritzSolve(m).E0 - r.E0;
    pts += `<circle class="${m === M ? 'mk' : 'pt'}" cx="${X(m)}" cy="${Y(e)}" r="${m === M ? 7 : 4}"><title>M = ${m}: E₀ − E_exact = ${e.toExponential(2)} E₁</title></circle>`;
  }
  for (let k = lgmin; k <= lgmax; k += 4) g += `<line class="grid" x1="${L}" y1="${Y(10 ** k)}" x2="${R}" y2="${Y(10 ** k)}"/><text class="tick" x="${L - 6}" y="${Y(10 ** k) + 4}" text-anchor="end">10${k < 0 ? '⁻' : ''}${String(Math.abs(k)).split('').map(d => '⁰¹²³⁴⁵⁶⁷⁸⁹'[d]).join('')}</text>`;
  for (const m of [1, 4, 8, 12, 16]) g += `<text class="tick" x="${X(m)}" y="${B + 16}" text-anchor="middle">${m}</text>`;
  // right: the potential, the reference ground state and the M-function approximation
  const L2 = 360, R2 = 620, T2 = 30, B2 = 240;
  const X2 = x => L2 + x * (R2 - L2);
  const psiOf = cc => x => cc.reduce((s, v, i) => s + v * Math.SQRT2 * Math.sin((i + 1) * Math.PI * x), 0);
  const pr = psiOf(r.c), pm = psiOf(c);
  const pmax = 3.6;
  const Y2 = p => B2 - 70 - p / pmax * (B2 - T2 - 70);
  const curve = f => { let s = ''; for (let i = 0; i <= 200; i++) { const x = i / 200; s += (i ? 'L' : 'M') + X2(x).toFixed(1) + ' ' + Y2(f(x)).toFixed(1); } return s; };
  let vp = ''; for (let i = 0; i <= 200; i++) { const x = i / 200; vp += (i ? 'L' : 'M') + X2(x).toFixed(1) + ' ' + Math.max(T2, B2 - V(x) / 200 * 40).toFixed(1); }
  return `<svg class="vp-svg" viewBox="0 0 640 290" role="img" aria-label="Rayleigh-Ritz with ${M} basis functions: ground-state energy ${E0.toFixed(4)} E1 against ${r.E0.toFixed(4)} E1">
    ${g}
    <line class="ax" x1="${L}" y1="${B}" x2="${R}" y2="${B}"/><line class="ax" x1="${L}" y1="${T}" x2="${L}" y2="${B}"/>
    ${pts}
    <text class="axl" x="${(L + R) / 2}" y="${B + 32}" text-anchor="middle">number of basis functions M</text>
    <text class="axl" x="16" y="${(T + B) / 2}" text-anchor="middle" transform="rotate(-90 16 ${(T + B) / 2})">E₀(M) − E₀(exact)  (E₁)</text>
    <path class="pot" d="${vp}"/>
    <line class="wall" x1="${L2}" y1="${T2}" x2="${L2}" y2="${B2}"/><line class="wall" x1="${R2}" y1="${T2}" x2="${R2}" y2="${B2}"/>
    <line class="ax" x1="${L2}" y1="${B2}" x2="${R2}" y2="${B2}"/>
    <path class="exact-psi" d="${curve(pr)}"/>
    <path class="trial-psi" d="${curve(pm)}"/>
    <text class="lbl ex" x="${R2 - 6}" y="${T2 + 8}" text-anchor="end">— converged ψ₀</text>
    <text class="lbl tr" x="${R2 - 6}" y="${T2 + 26}" text-anchor="end">— with M = ${M}</text>
    <text class="tick" x="${(L2 + R2) / 2}" y="${B2 + 16}" text-anchor="middle">box, with the well V(x) in grey</text>
  </svg>`;
}

export function ritz(fig) {
  const body = fig.querySelector('.fig-body');
  const panel = document.createElement('div');
  panel.className = 'fig-panel';
  panel.innerHTML = `<label>M <input type="range" min="1" max="16" step="1" value="2" aria-label="Number of basis functions"></label><p class="readout" aria-live="polite"></p>`;
  body.after(panel);
  const out = panel.querySelector('.readout');
  let M = 2;
  const draw = () => {
    const { E0 } = ritzSolve(M), r = ref();
    body.innerHTML = ritzSVG(M);
    out.innerHTML = `M = ${M}: a ${M} × ${M} matrix<br>E₀(M) = <b>${E0.toFixed(5)} E₁</b><br>Converged: ${r.E0.toFixed(5)} E₁<br>Error: <b>${(E0 - r.E0).toExponential(1)} E₁</b>, never negative`;
  };
  panel.querySelector('input').addEventListener('input', e => { M = +e.target.value; draw(); });
  draw();
}

export const snapshots = {
  trial: () => trialSVG('ho', 0.3),
  mixing: () => mixingSVG(0.2),
  ritz: () => ritzSVG(2),
};
