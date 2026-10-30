/* Figures for Lecture 6 (hartree-fock-method).
   scf: restricted Hartree–Fock for the helium atom, solved in the browser. One doubly occupied 1s
        orbital is expanded in M s-type Gaussians e^{−αr²} (all integrals analytic, Hartree atomic
        units); the Roothaan–Hall equations FC = SCε are solved by repeated diagonalization, starting
        from the bare-nucleus guess, until the energy stops changing. The exponents are even-tempered,
        α_k = 0.1 × 2.6^k, added in an order that keeps every smaller basis inside the larger one.
   References: HF limit −2.86167999561 Ha (Hatano & Yamamoto 2020, Table 3); exact nonrelativistic
   clamped-nucleus energy −2.903724377034 Ha (Hylleraas-type calculations, e.g. Drake); measured total
   from NIST's two ionization energies, 24.587389011 + 54.4177655282 eV. */

import { eigh } from './variational-principle-basis-sets.js';

export const HA_EV = 27.211386245981;                 // CODATA 2022
export const HF_LIMIT = -2.86167999561;              // Ha, Hatano & Yamamoto 2020
export const E_EXACT = -2.903724377034;            // Ha, exact for the same Hamiltonian
export const E_EXP = -(24.587389011 + 54.4177655282) / HA_EV;   // Ha, from NIST ionization energies
const Z = 2;
const ALL = Array.from({ length: 12 }, (_, k) => 0.1 * 2.6 ** k);
const ORDER = [2, 3, 1, 4, 0, 5, 6, 7, 8, 9, 10, 11];
export const exponents = M => ORDER.slice(0, M).map(k => ALL[k]);

const mm = (A, B) => A.map(r => B[0].map((_, j) => r.reduce((s, v, k) => s + v * B[k][j], 0)));
const tr = A => A[0].map((_, j) => A.map(r => r[j]));

/** Set up integrals for basis exponents a; returns a step function for SCF iterations. */
export function heliumSCF(M) {
  const a = exponents(M);
  const S = a.map(x => a.map(y => (Math.PI / (x + y)) ** 1.5));
  const H = a.map(x => a.map(y => { const p = x + y; return 3 * x * y / p * (Math.PI / p) ** 1.5 - Z * 2 * Math.PI / p; }));
  const eri = (i, j, k, l) => { const p = a[i] + a[j], q = a[k] + a[l]; return 2 * Math.PI ** 2.5 / (p * q * Math.sqrt(p + q)); };
  const { values: sv, vectors: su } = eigh(S);
  const X = a.map((_, i) => a.map((_, j) => su.reduce((s, v, k) => s + v[i] * v[j] / Math.sqrt(sv[k]), 0)));   // S^{-1/2}
  let F = H, E = null;
  const log = [];
  return {
    log,
    /** One SCF cycle: diagonalize F, occupy the lowest orbital twice, rebuild F and the energy. */
    step() {
      const { values, vectors } = eigh(mm(mm(tr(X), F), X));
      const c = X.map(r => r.reduce((s, v, k) => s + v * vectors[0][k], 0));
      const eps = values[0];
      const G = a.map((_, i) => a.map((_, j) => { let s = 0; for (let k = 0; k < M; k++) for (let l = 0; l < M; l++) s += c[k] * c[l] * (2 * eri(i, j, k, l) - eri(i, k, j, l)); return s; }));
      let e = 0, h = 0;
      for (let i = 0; i < M; i++) for (let j = 0; j < M; j++) { e += c[i] * c[j] * (2 * H[i][j] + G[i][j]); h += c[i] * c[j] * H[i][j]; }
      const row = { n: log.length + 1, E: e, dE: E === null ? e : e - E, eps, J: e - 2 * h };
      log.push(row);
      E = e;
      F = H.map((r, i) => r.map((v, j) => v + G[i][j]));
      return row;
    },
  };
}
/** Converged restricted HF for helium with M basis functions. */
export function heliumHF(M, tol = 1e-12) {
  const s = heliumSCF(M);
  let r;
  do r = s.step(); while (Math.abs(r.dE) > tol && s.log.length < 60);
  return { ...r, iterations: s.log.length };
}

function scfSVG(log, M) {
  const L = 70, R = 360, T = 24, B = 240;
  const e0 = -2.95, e1 = -2.25;
  const n = Math.max(8, log.length);
  const X = k => L + (k - 1) / (n - 1) * (R - L), Y = e => B - (Math.min(e1, Math.max(e0, e)) - e0) / (e1 - e0) * (B - T);
  let g = '';
  for (let e = -2.9; e <= -2.3 + 1e-9; e += 0.1) g += `<line class="grid" x1="${L}" y1="${Y(e)}" x2="${R}" y2="${Y(e)}"/><text class="tick" x="${L - 6}" y="${Y(e) + 4}" text-anchor="end">${e.toFixed(1)}</text>`;
  for (let k = 1; k <= n; k += n > 10 ? 2 : 1) g += `<text class="tick" x="${X(k)}" y="${B + 16}" text-anchor="middle">${k}</text>`;
  const pts = log.map(r => `<circle class="pt" cx="${X(r.n)}" cy="${Y(r.E)}" r="5"><title>iteration ${r.n}: ${r.E.toFixed(6)} Ha</title></circle>`).join('');
  const line = log.map((r, i) => (i ? 'L' : 'M') + X(r.n).toFixed(1) + ' ' + Y(r.E).toFixed(1)).join('');
  // right: the energy ladder
  const x2 = 400, w2 = 60;
  // label above the line (dy < 0) or below it (dy > 0), so that close levels do not collide
  const lv = (e, cls, t1, t2, dy) => `<line class="${cls}" x1="${x2}" y1="${Y(e)}" x2="${x2 + w2}" y2="${Y(e)}"/><text class="lv" x="${x2 + w2 + 8}" y="${Y(e) + dy}">${t1} <tspan class="lv2">${t2}</tspan></text>`;
  const last = log.at(-1);
  return `<svg class="hf-svg" viewBox="0 0 640 290" role="img" aria-label="Hartree-Fock SCF iterations for helium with ${M} Gaussians${last ? `: ${last.E.toFixed(5)} hartree after ${log.length} iterations` : ''}">
    ${g}
    <line class="ax" x1="${L}" y1="${B}" x2="${R}" y2="${B}"/><line class="ax" x1="${L}" y1="${T}" x2="${L}" y2="${B}"/>
    <line class="ref" x1="${L}" y1="${Y(HF_LIMIT)}" x2="${R}" y2="${Y(HF_LIMIT)}"/>
    <line class="ref ex" x1="${L}" y1="${Y(E_EXACT)}" x2="${R}" y2="${Y(E_EXACT)}"/>
    ${log.length ? `<path class="trace" d="${line}"/>` : ''}${pts}
    <text class="axl" x="${(L + R) / 2}" y="${B + 32}" text-anchor="middle">SCF iteration</text>
    <text class="axl" x="16" y="${(T + B) / 2}" text-anchor="middle" transform="rotate(-90 16 ${(T + B) / 2})">energy (hartree)</text>
    ${lv(HF_LIMIT, 'ref', 'HF limit', '−2.8617 Ha', -6)}
    ${lv(E_EXACT, 'ref ex', 'exact', '−2.9037 Ha', 16)}
    ${last ? lv(last.E, 'cur', `this run, M = ${M}`, `${last.E.toFixed(4)} Ha`, last.E > HF_LIMIT + 0.03 ? -6 : -22) : ''}
  </svg>`;
}

export function scf(fig) {
  const body = fig.querySelector('.fig-body');
  const panel = document.createElement('div');
  panel.className = 'fig-panel';
  panel.innerHTML = `<label>Gaussians M <input type="range" min="1" max="12" step="1" value="10" aria-label="Number of basis functions"></label>
    <p class="row"><button type="button" class="btn-step" data-act="step">One iteration</button><button type="button" class="btn-step play" data-act="run">Run to convergence</button><button type="button" class="btn-step" data-act="reset">Reset</button></p>
    <table class="tbl pes-log"><thead><tr><th>Iter.</th><th>E (Ha)</th><th>ΔE (Ha)</th><th>ε₁ₛ (Ha)</th></tr></thead><tbody></tbody></table>
    <p class="readout" aria-live="polite"></p>`;
  body.after(panel);
  const tbody = panel.querySelector('tbody');
  const out = panel.querySelector('.readout');
  let M = 10, s = heliumSCF(M), timer = 0;
  const done = () => s.log.length > 1 && Math.abs(s.log.at(-1).dE) < 1e-8;
  const draw = () => {
    body.innerHTML = scfSVG(s.log, M);
    const rows = s.log.slice(-6).map(r => `<tr><td>${r.n}</td><td>${r.E.toFixed(6)}</td><td>${r.n === 1 ? '–' : r.dE.toExponential(1)}</td><td>${r.eps.toFixed(5)}</td></tr>`).join('');
    tbody.innerHTML = (s.log.length > 6 ? `<tr class="more"><td colspan="4">… ${s.log.length - 6} earlier</td></tr>` : '') + rows;
    const r = s.log.at(-1);
    out.innerHTML = !r ? 'Start: orbitals of the bare nucleus, no repulsion.'
      : done() ? `<span class="pes-status done">Self-consistent</span> after ${r.n} iterations<br>E − HF limit = ${(r.E - HF_LIMIT).toExponential(1)} Ha<br>Koopmans: −ε₁ₛ = <b>${(-r.eps * HA_EV).toFixed(2)} eV</b> (measured: 24.59 eV)`
      : `Iteration ${r.n}: not yet self-consistent`;
  };
  const stop = () => { clearInterval(timer); timer = 0; panel.querySelector('[data-act="run"]').textContent = 'Run to convergence'; };
  panel.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.act === 'step') { stop(); if (!done()) s.step(); draw(); }
    else if (b.dataset.act === 'reset') { stop(); s = heliumSCF(M); draw(); }
    else if (b.dataset.act === 'run') {
      if (timer) { stop(); return; }
      b.textContent = 'Pause';
      timer = setInterval(() => { if (done() || s.log.length >= 40) { stop(); return; } s.step(); draw(); }, 450);
    }
  });
  panel.querySelector('input').addEventListener('input', e => { stop(); M = +e.target.value; s = heliumSCF(M); draw(); });
  draw();
}

export const snapshots = {
  scf: () => { const s = heliumSCF(10); for (let k = 0; k < 8; k++) s.step(); return scfSVG(s.log, 10); },
};
