/* Figures for Lecture 4 (atomic-orbitals-core-valence-electrons).
   orbital: hydrogen orbitals ψ_nℓ0 = R_nℓ(r) Y_ℓ0(θ) in Hartree atomic units (Z = 1, infinitely heavy
            nucleus): the radial probability r²R² with its nodes, and the angular shape |Y_ℓ0|² in the
            xz plane, coloured by the sign of Y.
   shells:  titanium's shells, and which of them each VASP dataset (Ti, Ti_pv, Ti_sv) treats as
            valence. Valence counts, configurations and ENMAX from the VASP Wiki table of
            recommended PBE potentials (potpaw.64); the atom's ground configuration from NIST ASD. */

const fact = n => (n <= 1 ? 1 : n * fact(n - 1));

/** Generalized Laguerre polynomial L_k^(a)(x), by the three-term recurrence. */
export function laguerre(k, a, x) {
  if (k === 0) return 1;
  let l0 = 1, l1 = 1 + a - x;
  for (let j = 1; j < k; j++) [l0, l1] = [l1, ((2 * j + 1 + a - x) * l1 - (j + a) * l0) / (j + 1)];
  return l1;
}
/** Hydrogen radial function R_nℓ(r), r in bohr, normalized so that ∫ R² r² dr = 1. */
export function radial(n, l, r) {
  const N = Math.sqrt((2 / n) ** 3 * fact(n - l - 1) / (2 * n * fact(n + l)));
  const x = 2 * r / n;
  return N * Math.exp(-x / 2) * x ** l * laguerre(n - l - 1, 2 * l + 1, x);
}
/** Legendre polynomial P_ℓ(x). */
export function legendre(l, x) {
  let p0 = 1, p1 = x;
  if (l === 0) return 1;
  for (let j = 1; j < l; j++) [p0, p1] = [p1, ((2 * j + 1) * x * p1 - j * p0) / (j + 1)];
  return p1;
}
/** ⟨r⟩ for hydrogen state nℓ, in bohr. */
export const meanR = (n, l) => (3 * n * n - l * (l + 1)) / 2;
/** Energy of level n in eV: −1 rydberg / n², with 1 Ry = E_h/2 (CODATA 2022). */
export const levelE = n => -13.605693122990 / (n * n);

const LET = 'spdf';
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';

function orbitalSVG(n, l) {
  // left: radial probability r²R², with radial nodes marked
  const L = 60, R = 340, T = 26, B = 236;
  const rmax = n === 1 ? 8 : n === 2 ? 16 : n === 3 ? 28 : 42;
  let pmax = 0;
  const pts = [];
  for (let i = 0; i <= 400; i++) {
    const r = rmax * i / 400, p = r * r * radial(n, l, r) ** 2;
    pts.push([r, p]); pmax = Math.max(pmax, p);
  }
  const X = r => L + r / rmax * (R - L), Y = p => B - p / (pmax * 1.12) * (B - T);
  const d = pts.map(([r, p], i) => (i ? 'L' : 'M') + X(r).toFixed(1) + ' ' + Y(p).toFixed(1)).join('');
  let nodes = '';
  for (let i = 1; i < pts.length; i++) {
    const r0 = pts[i - 1][0], r1 = pts[i][0];
    if (r0 > 0 && radial(n, l, r0) !== 0 && Math.sign(radial(n, l, r0)) !== Math.sign(radial(n, l, r1))) {
      const rn = r0 + (r1 - r0) * radial(n, l, r0) / (radial(n, l, r0) - radial(n, l, r1));
      nodes += `<line class="node-l" x1="${X(rn)}" y1="${T}" x2="${X(rn)}" y2="${B}"/><text class="tick" x="${X(rn)}" y="${T - 6}" text-anchor="middle">node</text>`;
    }
  }
  let ticks = '';
  const step = rmax <= 8 ? 2 : rmax <= 16 ? 4 : 10;
  for (let r = 0; r <= rmax; r += step) ticks += `<text class="tick" x="${X(r)}" y="${B + 16}" text-anchor="middle">${r}</text>`;
  const mr = meanR(n, l);
  // right: angular shape |Y_ℓ0(θ)|² in the xz plane, lobes coloured by the sign of P_ℓ(cos θ)
  const cx = 490, cy = 132, rad = 92;
  const ymax = Math.max(...Array.from({ length: 181 }, (_, i) => legendre(l, Math.cos(i * Math.PI / 180)) ** 2));
  // trace |Y|² around the circle, starting at a sign change so that no lobe is split in two
  let lobes = '';
  const pts2 = [];
  for (let i = 0; i < 720; i++) {
    const th = i * Math.PI / 360;                       // 0 … 2π around the z axis in the xz plane
    const v = legendre(l, Math.cos(th));
    pts2.push([v, cx + rad * v * v / ymax * Math.sin(th), cy - rad * v * v / ymax * Math.cos(th)]);
  }
  if (l === 0) lobes = `<circle class="lobe pos" cx="${cx}" cy="${cy}" r="${rad}"/>`;
  else {
    const start = pts2.findIndex((p, i) => i > 0 && Math.sign(p[0]) !== Math.sign(pts2[i - 1][0]));
    let seg = [], cur = Math.sign(pts2[start][0]);
    const flush = () => { if (seg.length > 1) lobes += `<path class="lobe ${cur > 0 ? 'pos' : 'neg'}" d="M${seg.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L')} Z"/>`; };
    for (let k = 0; k <= 720; k++) {
      const [v, x, y] = pts2[(start + k) % 720];
      const sgn = Math.sign(v) || cur;
      if (sgn !== cur) { seg.push([cx, cy]); flush(); seg = [[cx, cy]]; cur = sgn; }
      seg.push([x, y]);
    }
    flush();
  }
  return `<svg class="orb-svg" viewBox="0 0 640 280" role="img" aria-label="Hydrogen ${n}${LET[l]} orbital: ${n - l - 1} radial nodes, ${l} angular nodes, mean radius ${mr} bohr">
    <line class="ax" x1="${L}" y1="${B}" x2="${R}" y2="${B}"/><line class="ax" x1="${L}" y1="${T}" x2="${L}" y2="${B}"/>
    ${nodes}
    <path class="rad" d="${d}"/>
    <line class="mean" x1="${X(mr)}" y1="${B}" x2="${X(mr)}" y2="${B - 14}"/><text class="tick" x="${X(mr)}" y="${B - 18}" text-anchor="middle">⟨r⟩</text>
    ${ticks}
    <text class="axl" x="${(L + R) / 2}" y="${B + 32}" text-anchor="middle">r (bohr)</text>
    <text class="axl" x="18" y="${(T + B) / 2}" text-anchor="middle" transform="rotate(-90 18 ${(T + B) / 2})">r²R² (radial probability)</text>
    <line class="axis-z" x1="${cx}" y1="${cy - rad - 14}" x2="${cx}" y2="${cy + rad + 14}"/><text class="tick" x="${cx + 6}" y="${cy - rad - 6}">z</text>
    <line class="axis-z" x1="${cx - rad - 14}" y1="${cy}" x2="${cx + rad + 14}" y2="${cy}"/><text class="tick" x="${cx + rad + 10}" y="${cy - 6}">x</text>
    ${lobes}
    <text class="lbl" x="${cx}" y="${B + 32}" text-anchor="middle">angular shape, m = 0 (blue +, orange −)</text>
  </svg>`;
}

export function orbital(fig) {
  const body = fig.querySelector('.fig-body');
  const panel = document.createElement('div');
  panel.className = 'fig-panel';
  panel.innerHTML = `<p>n <span class="seg">${[1, 2, 3, 4].map(n => `<button type="button" data-n="${n}">${n}</button>`).join('')}</span></p>
    <p>ℓ <span class="seg" data-ls></span></p>
    <p class="readout" aria-live="polite"></p>`;
  body.after(panel);
  const lsBox = panel.querySelector('[data-ls]');
  const out = panel.querySelector('.readout');
  let n = 3, l = 0;
  const draw = () => {
    panel.querySelectorAll('[data-n]').forEach(b => b.classList.toggle('on', +b.dataset.n === n));
    lsBox.innerHTML = Array.from({ length: n }, (_, k) => `<button type="button" data-l="${k}"${k === l ? ' class="on"' : ''}>${k} (${LET[k]})</button>`).join('');
    body.innerHTML = orbitalSVG(n, l);
    out.innerHTML = `<b>${n}${LET[l]}</b>: ${n - l - 1} radial node${n - l - 1 === 1 ? '' : 's'}, ${l} angular node${l === 1 ? '' : 's'}<br>E = −1 Ry / ${n}² = <b>${levelE(n).toFixed(3)} eV</b><br>⟨r⟩ = <b>${meanR(n, l)} bohr</b> (${(meanR(n, l) * 0.529177).toFixed(2)} Å)<br>${n * n} states share this energy (${2 * l + 1} with ℓ = ${l})`;
  };
  panel.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.n) { n = +b.dataset.n; l = Math.min(l, n - 1); }
    if (b.dataset.l) l = +b.dataset.l;
    draw();
  });
  draw();
}

/* ---------------- titanium: core and valence in each dataset ---------------- */

// Titanium, Z = 22, ground configuration [Ar] 3d² 4s² (NIST ASD), shells listed from the inside out.
export const TI_SHELLS = [['1s', 2], ['2s', 2], ['2p', 6], ['3s', 2], ['3p', 6], ['3d', 2], ['4s', 2]];
// VASP Wiki, recommended PBE potentials (potpaw.64): valence electrons, configuration, ENMAX (eV)
export const TI_SETS = {
  Ti: { zval: 4, conf: '3d³ 4s¹', enmax: 178.33, valence: ['3d', '4s'] },
  Ti_pv: { zval: 10, conf: '3p⁶ 3d³ 4s¹', enmax: 222.335, valence: ['3p', '3d', '4s'] },
  Ti_sv: { zval: 12, conf: '3s² 3p⁶ 3d³ 4s¹', enmax: 274.61, valence: ['3s', '3p', '3d', '4s'], recommended: true },
};

function shellsSVG(key) {
  const set = TI_SETS[key];
  const W = 74, gap = 10, x0 = 40, y = 70, h = 70;
  let g = '', core = 0;
  TI_SHELLS.forEach(([name, ne], i) => {
    const val = set.valence.includes(name);
    if (!val) core += ne;
    const x = x0 + i * (W + gap);
    g += `<g class="shell ${val ? 'val' : 'core'}"><rect x="${x}" y="${y}" width="${W}" height="${h}" rx="8"/>
      <text class="sh" x="${x + W / 2}" y="${y + 30}" text-anchor="middle">${name}</text>
      <text class="ne" x="${x + W / 2}" y="${y + 52}" text-anchor="middle">${ne} e⁻</text></g>`;
  });
  const firstVal = TI_SHELLS.findIndex(([n]) => set.valence.includes(n));
  const xs = x0 + firstVal * (W + gap) - gap / 2;
  return `<svg class="shell-svg" viewBox="0 0 640 220" role="img" aria-label="Titanium with the ${key} dataset: ${set.zval} valence electrons, ${core} in the frozen core">
    <text class="lbl" x="${x0}" y="40">Titanium, 22 electrons, from the nucleus outwards →</text>
    ${g}
    <line class="split" x1="${xs}" y1="${y - 14}" x2="${xs}" y2="${y + h + 14}"/>
    <text class="cap core-t" x="${(x0 + xs) / 2}" y="${y + h + 34}" text-anchor="middle">frozen core: ${core} e⁻</text>
    <text class="cap val-t" x="${(xs + x0 + TI_SHELLS.length * (W + gap)) / 2}" y="${y + h + 34}" text-anchor="middle">valence: ${set.zval} e⁻ = ZVAL</text>
  </svg>`;
}

export function shells(fig) {
  const body = fig.querySelector('.fig-body');
  const panel = document.createElement('div');
  panel.className = 'fig-controls';
  panel.innerHTML = `<span class="seg">${Object.keys(TI_SETS).map(k => `<button type="button" data-k="${k}"${k === 'Ti_sv' ? ' class="on"' : ''}>${k}</button>`).join('')}</span><span class="readout" aria-live="polite"></span>`;
  body.after(panel);
  const out = panel.querySelector('.readout');
  let key = 'Ti_sv';
  const draw = () => {
    const s = TI_SETS[key];
    body.innerHTML = shellsSVG(key);
    out.innerHTML = `ZVAL = <b>${s.zval}</b> · ENMAX = <b>${s.enmax} eV</b> · dataset configuration ${s.conf}${s.recommended ? ' · recommended' : ''}`;
  };
  panel.addEventListener('click', e => {
    const b = e.target.closest('[data-k]');
    if (!b) return;
    key = b.dataset.k;
    panel.querySelectorAll('[data-k]').forEach(x => x.classList.toggle('on', x === b));
    draw();
  });
  draw();
}

export const snapshots = {
  orbital: () => orbitalSVG(3, 0),
  shells: () => shellsSVG('Ti_sv'),
};
