/* Figures for Lecture 2 (wavefunctions-operators-eigenvalues), all for one particle in a
   one-dimensional box of length L with infinitely high walls:
     ψ_n(x) = √(2/L) sin(nπx/L),  E_n = n² h² / (8 m L²)   (MIT 5.61, Lecture 5)
   prob:   ψ_n and |ψ_n|², and the probability of finding the particle between a and b.
   levels: the energy levels and their standing waves, in eV for an electron.
   mix:    a superposition of the three lowest states; each "measurement" of the energy returns
           one eigenvalue E_n with probability |c_n|², and the histogram approaches those values. */

// Exact SI constants and CODATA 2022 electron mass
const H = 6.62607015e-34;            // J s, exact
const E_CHARGE = 1.602176634e-19;    // C, exact
const M_E = 9.1093837139e-31;        // kg, CODATA 2022

/** Energy of level n, in eV, for an electron in a box of length L (Å). */
export const boxE = (n, L) => (n * n * H * H) / (8 * M_E * (L * 1e-10) ** 2) / E_CHARGE;
/** ψ_n(x) for a box of unit length, x in [0, 1]. */
export const boxPsi = (n, x) => Math.SQRT2 * Math.sin(n * Math.PI * x);
/** Probability of finding the particle in state n between a and b (unit box). */
export const boxProb = (n, a, b) => {
  const F = x => x - Math.sin(2 * n * Math.PI * x) / (2 * n * Math.PI);
  return F(Math.max(a, b)) - F(Math.min(a, b));
};
/** Normalized coefficients, probabilities and ⟨E⟩/E₁ of a real superposition of ψ₁, ψ₂, ψ₃. */
export function mixStats(raw) {
  const norm = Math.hypot(...raw) || 1;
  const c = raw.map(v => v / norm);
  const P = c.map(v => v * v);
  return { c, P, meanE: P.reduce((s, p, i) => s + p * (i + 1) ** 2, 0) };
}

const sub = n => '₀₁₂₃₄₅₆₇₈₉'[n];
const path = (f, X, Y, n = 200) => {
  let d = '';
  for (let i = 0; i <= n; i++) { const x = i / n; d += (i ? 'L' : 'M') + X(x).toFixed(1) + ' ' + Y(f(x)).toFixed(1); }
  return d;
};

/* ---------------- prob: ψ and |ψ|² ---------------- */

const PL = 70, PR = 610;
const px = x => PL + x * (PR - PL);

function probSVG(n, a, b) {
  const T0 = 22, T1 = 122, B0 = 160, B1 = 262;      // top panel ψ, bottom panel |ψ|²
  const yPsi = v => (T0 + T1) / 2 - v / 1.6 * (T1 - T0) / 2;
  const yRho = v => B1 - v / 2.2 * (B1 - B0);
  const lo = Math.min(a, b), hi = Math.max(a, b);
  let area = `M${px(lo)} ${yRho(0)}`;
  for (let i = 0; i <= 80; i++) { const x = lo + (hi - lo) * i / 80; area += `L${px(x).toFixed(1)} ${yRho(boxPsi(n, x) ** 2).toFixed(1)}`; }
  area += `L${px(hi)} ${yRho(0)}Z`;
  const P = boxProb(n, a, b);
  return `<svg class="qm-svg" viewBox="0 0 640 300" role="img" aria-label="Wavefunction psi ${n} and its square in a box; probability ${P.toFixed(2)} between ${lo.toFixed(2)} L and ${hi.toFixed(2)} L">
    <line class="zero" x1="${PL}" y1="${yPsi(0)}" x2="${PR}" y2="${yPsi(0)}"/>
    <line class="wall" x1="${PL}" y1="${T0 - 6}" x2="${PL}" y2="${B1}"/><line class="wall" x1="${PR}" y1="${T0 - 6}" x2="${PR}" y2="${B1}"/>
    <path class="psi" d="${path(x => boxPsi(n, x), px, yPsi)}"/>
    <text class="lbl psi-t" x="${PL - 10}" y="${yPsi(0) + 4}" text-anchor="end">ψ${sub(n)}(x)</text>
    <path class="area" d="${area}"/>
    <line class="ax" x1="${PL}" y1="${B1}" x2="${PR}" y2="${B1}"/>
    <path class="rho" d="${path(x => boxPsi(n, x) ** 2, px, yRho)}"/>
    <text class="lbl rho-t" x="${PL - 10}" y="${(B0 + B1) / 2 + 4}" text-anchor="end">|ψ${sub(n)}|²</text>
    <line class="edge" x1="${px(lo)}" y1="${B0 - 8}" x2="${px(lo)}" y2="${B1}"/><line class="edge" x1="${px(hi)}" y1="${B0 - 8}" x2="${px(hi)}" y2="${B1}"/>
    <text class="pval" x="${(px(lo) + px(hi)) / 2}" y="${B0 - 12}" text-anchor="middle">P = ${P.toFixed(2)}</text>
    <text class="tick" x="${PL}" y="${B1 + 16}" text-anchor="middle">0</text><text class="tick" x="${PR}" y="${B1 + 16}" text-anchor="middle">L</text>
    <text class="axl" x="${(PL + PR) / 2}" y="${B1 + 30}" text-anchor="middle">Position x in the box</text>
  </svg>`;
}

export function prob(fig) {
  const body = fig.querySelector('.fig-body');
  const panel = document.createElement('div');
  panel.className = 'fig-panel';
  panel.innerHTML = `<p>State <span class="seg">${[1, 2, 3].map(n => `<button type="button" data-n="${n}"${n === 2 ? ' class="on"' : ''}>ψ${sub(n)}</button>`).join('')}</span></p>
    <label>from a <input type="range" min="0" max="1" step="0.01" value="0.1" data-k="a" aria-label="Start of the region, as a fraction of L"></label>
    <label>to b <input type="range" min="0" max="1" step="0.01" value="0.4" data-k="b" aria-label="End of the region, as a fraction of L"></label>
    <p class="readout" aria-live="polite"></p>`;
  body.after(panel);
  const out = panel.querySelector('.readout');
  let n = 2, a = 0.1, b = 0.4;
  const draw = () => {
    body.innerHTML = probSVG(n, a, b);
    out.innerHTML = `Probability between ${Math.min(a, b).toFixed(2)} L and ${Math.max(a, b).toFixed(2)} L: <b>${boxProb(n, a, b).toFixed(3)}</b><br>Whole box: <b>${boxProb(n, 0, 1).toFixed(3)}</b> (normalized)`;
  };
  panel.addEventListener('input', e => { if (e.target.dataset.k === 'a') a = +e.target.value; else if (e.target.dataset.k === 'b') b = +e.target.value; draw(); });
  panel.addEventListener('click', e => {
    const btn = e.target.closest('[data-n]');
    if (!btn) return;
    n = +btn.dataset.n;
    panel.querySelectorAll('[data-n]').forEach(x => x.classList.toggle('on', x === btn));
    draw();
  });
  draw();
}

/* ---------------- levels: energies and standing waves ---------------- */

function levelsSVG(L, mode) {
  const top = 24, bot = 262, NMAX = 4, x0 = 120, x1 = 470;
  const Y = e => bot - e / (NMAX * NMAX + 2) * (bot - top);          // e in units of E₁
  const X = x => x0 + x * (x1 - x0);
  const amp = 26;
  let g = '';
  for (let n = 1; n <= NMAX; n++) {
    const y = Y(n * n);
    const f = mode === 'psi' ? x => boxPsi(n, x) / Math.SQRT2 : x => boxPsi(n, x) ** 2 / 2;
    g += `<line class="lvl" x1="${x0}" y1="${y}" x2="${x1}" y2="${y}"/>
      <path class="${mode === 'psi' ? 'psi' : 'rho'}" d="${path(x => f(x), X, v => y - v * amp)}"/>
      <text class="lbl" x="${x1 + 14}" y="${y + 4}">n = ${n}</text>
      <text class="eval" x="${x1 + 64}" y="${y + 4}">${boxE(n, L).toFixed(2)} eV</text>
      <text class="tick" x="${x0 - 10}" y="${y + 4}" text-anchor="end">${n * n}E₁</text>`;
  }
  return `<svg class="qm-svg" viewBox="0 0 640 296" role="img" aria-label="Energy levels of an electron in a ${L} ångström box: ${[1, 2, 3, 4].map(n => boxE(n, L).toFixed(2)).join(', ')} eV">
    <line class="wall" x1="${x0}" y1="${top - 10}" x2="${x0}" y2="${bot + 6}"/><line class="wall" x1="${x1}" y1="${top - 10}" x2="${x1}" y2="${bot + 6}"/>
    <line class="ax" x1="${x0}" y1="${bot + 6}" x2="${x1}" y2="${bot + 6}"/>
    ${g}
    <text class="axl" x="${(x0 + x1) / 2}" y="${bot + 26}" text-anchor="middle">Box of length L = ${L.toFixed(1)} Å</text>
    <text class="axl" x="22" y="${(top + bot) / 2}" text-anchor="middle" transform="rotate(-90 22 ${(top + bot) / 2})">Energy (to scale)</text>
  </svg>`;
}

export function levels(fig) {
  const body = fig.querySelector('.fig-body');
  const panel = document.createElement('div');
  panel.className = 'fig-panel';
  panel.innerHTML = `<p>Show <span class="seg"><button type="button" data-m="psi" class="on">ψ<sub>n</sub></button><button type="button" data-m="rho">|ψ<sub>n</sub>|²</button></span></p>
    <label>L <input type="range" min="1" max="10" step="0.1" value="5" aria-label="Box length in ångströms"></label>
    <p class="readout" aria-live="polite"></p>`;
  body.after(panel);
  const out = panel.querySelector('.readout');
  let L = 5, mode = 'psi';
  const draw = () => {
    body.innerHTML = levelsSVG(L, mode);
    out.innerHTML = `Electron in a ${L.toFixed(1)} Å box:<br>E₁ = <b>${boxE(1, L).toFixed(3)} eV</b>, E₂ = 4E₁ = <b>${boxE(2, L).toFixed(3)} eV</b><br>Halve L and every energy grows four times.`;
  };
  panel.querySelector('input').addEventListener('input', e => { L = +e.target.value; draw(); });
  panel.addEventListener('click', e => {
    const btn = e.target.closest('[data-m]');
    if (!btn) return;
    mode = btn.dataset.m;
    panel.querySelectorAll('[data-m]').forEach(x => x.classList.toggle('on', x === btn));
    draw();
  });
  draw();
}

/* ---------------- mix: superposition and measurement ---------------- */

function mixSVG(raw, counts) {
  const { c, P } = mixStats(raw);
  const psi = x => c.reduce((s, cn, i) => s + cn * boxPsi(i + 1, x), 0);
  const X = x => 40 + x * 330;
  const T0 = 30, T1 = 250, mid = (T0 + T1) / 2;
  const yR = v => T1 - v / 4.5 * (T1 - T0);
  // histogram of measured energies, with the expected probabilities as markers
  const total = counts.reduce((s, v) => s + v, 0);
  const hx = i => 440 + i * 62, hb = 250, hh = 200;
  let bars = '';
  for (let i = 0; i < 3; i++) {
    const f = total ? counts[i] / total : 0;
    bars += `<rect class="bar" x="${hx(i)}" y="${hb - f * hh}" width="40" height="${f * hh}" rx="3"/>
      <line class="expect" x1="${hx(i) - 6}" y1="${hb - P[i] * hh}" x2="${hx(i) + 46}" y2="${hb - P[i] * hh}"/>
      <text class="tick" x="${hx(i) + 20}" y="${hb + 16}" text-anchor="middle">${(i + 1) ** 2}E₁</text>`;
  }
  return `<svg class="qm-svg" viewBox="0 0 640 296" role="img" aria-label="Probability density of a superposition, and a histogram of measured energies">
    <line class="wall" x1="40" y1="${T0}" x2="40" y2="${T1}"/><line class="wall" x1="370" y1="${T0}" x2="370" y2="${T1}"/>
    <line class="ax" x1="40" y1="${T1}" x2="370" y2="${T1}"/>
    <path class="rho" d="${path(x => psi(x) ** 2, X, yR)}"/>
    <text class="lbl rho-t" x="205" y="${T0 - 10}" text-anchor="middle">|ψ(x)|² of the superposition</text>
    <line class="ax" x1="430" y1="${hb}" x2="630" y2="${hb}"/>
    ${bars}
    <text class="lbl" x="535" y="${T0 - 10}" text-anchor="middle">Measured energies${total ? ` (${total})` : ''}</text>
    <text class="tick" x="535" y="${hb + 32}" text-anchor="middle">bars: measured · orange lines: |c<tspan baseline-shift="sub" font-size="8">n</tspan>|²</text>
  </svg>`;
}

export function mix(fig) {
  const body = fig.querySelector('.fig-body');
  const panel = document.createElement('div');
  panel.className = 'fig-panel';
  panel.innerHTML = `${[1, 2, 3].map(n => `<label>c${sub(n)} <input type="range" min="-1" max="1" step="0.05" value="${n === 1 ? 0.8 : n === 2 ? 0.6 : 0}" data-i="${n - 1}" aria-label="Coefficient of state ${n}"></label>`).join('')}
    <p class="row"><button type="button" class="btn-step" data-m="1">Measure once</button><button type="button" class="btn-step" data-m="100">Measure 100 times</button><button type="button" class="btn-step" data-m="0">Clear</button></p>
    <p class="readout" aria-live="polite"></p>`;
  body.after(panel);
  const out = panel.querySelector('.readout');
  let raw = [0.8, 0.6, 0], counts = [0, 0, 0], last = '';
  const draw = () => {
    const { c, P, meanE } = mixStats(raw);
    body.innerHTML = mixSVG(raw, counts);
    out.innerHTML = `Normalized: c = (${c.map(v => v.toFixed(2)).join(', ')})<br>P(E₁, E₂, E₃) = (${P.map(v => v.toFixed(2)).join(', ')})<br>⟨E⟩ = <b>${meanE.toFixed(2)} E₁</b>${last}`;
  };
  panel.addEventListener('input', e => {
    if (e.target.dataset.i === undefined) return;
    raw[+e.target.dataset.i] = +e.target.value;
    if (!raw.some(v => v)) raw[0] = 1e-9;
    counts = [0, 0, 0]; last = '';
    draw();
  });
  panel.addEventListener('click', e => {
    const btn = e.target.closest('[data-m]');
    if (!btn) return;
    const m = +btn.dataset.m;
    if (!m) { counts = [0, 0, 0]; last = ''; draw(); return; }
    const { P } = mixStats(raw);
    let got = 0;
    for (let k = 0; k < m; k++) {
      const r = Math.random();
      got = r < P[0] ? 0 : r < P[0] + P[1] ? 1 : 2;
      counts[got]++;
    }
    last = m === 1 ? `<br>This measurement gave <b>E${sub(got + 1)} = ${(got + 1) ** 2}E₁</b>, never ⟨E⟩.` : '';
    draw();
  });
  draw();
}

export const snapshots = {
  prob: () => probSVG(2, 0.1, 0.4),
  levels: () => levelsSVG(5, 'psi'),
  mix: () => mixSVG([0.8, 0.6, 0], [0, 0, 0]),
};
