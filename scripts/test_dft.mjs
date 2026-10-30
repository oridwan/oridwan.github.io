#!/usr/bin/env node
/**
 * Numerical checks for the DFT course figures: every number a figure computes is compared
 * with an exact or published reference value.
 *
 * Run: node scripts/test_dft.mjs
 */
import { UNITS, CARBON, wallLog10, wallMaxN } from "../dft/figs/what-is-dft.js";
import { MODELS, FMAX, descend } from "../dft/figs/born-oppenheimer-approximation.js";
import { boxE, boxPsi, boxProb, mixStats } from "../dft/figs/wavefunctions-operators-eigenvalues.js";
import { TRIALS, eigh, twoLevel, ritzSolve } from "../dft/figs/variational-principle-basis-sets.js";
import { radial, legendre, meanR, levelE, TI_SHELLS, TI_SETS } from "../dft/figs/atomic-orbitals-core-valence-electrons.js";
import { HELIUM, pairPsi, closeProb, psiLog10 } from "../dft/figs/pauli-exclusion-slater-determinant.js";
import { heliumHF, heliumSCF, HF_LIMIT, E_EXACT, E_EXP, HA_EV } from "../dft/figs/hartree-fock-method.js";

let failed = 0;
function near(name, got, want, rel = 1e-10) {
  const ok = Math.abs(got - want) <= rel * Math.abs(want);
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}: ${got} (reference ${want})`);
}

// Lecture 0, Figure 2: energy units against NIST CODATA 2022 relations
const eV = id => UNITS.find(u => u.id === id).eV;
near("1 eV / k_B in K (NIST: 1.160451812e4, exact)", 1 / eV("K"), 1.160451812e4, 1e-9);
near("1 eV / hc in cm^-1 (NIST: 8.065543937e5 m^-1, exact)", 1 / eV("cm"), 8065.543937, 1e-9);
near("1 eV in kJ/mol (e N_A / 1000, exact)", 1 / eV("kJmol"), 96.48533212331, 1e-11);
near("1 hartree in eV (CODATA 2022)", eV("Ha"), 27.211386245981);
near("1 rydberg = hartree / 2 (CODATA 2022, within uncertainty)", eV("Ry"), eV("Ha") / 2, 1e-12);

// Lecture 0, opening chart: energies above graphite as printed in Ridwan et al. 2026, Fig. 7 (eV/atom)
const FIG7 = { "mct-cI192": 0.211, "known-cP176": 0.226, "nku-a-cI384": 0.239, "known-cP216": 0.240,
               "NCG1-cP192": 0.197, "NCG2-cP108": 0.201, "NCG3-cP192": 0.221, "NCG4-cI144": 0.247 };
for (const c of CARBON) near(`carbon chart: ${c.name}`, c.e, FIG7[c.name], 1e-12);
const lowestKnown = Math.min(...CARBON.filter(c => c.known).map(c => c.e));
near("carbon chart: NCG1 lies 0.014 eV/atom below the lowest known structure", lowestKnown - CARBON[0].e, 0.014, 1e-9);

// Lecture 0, exponential wall: Kohn's Nobel lecture, section II.B, eqs. 2.12-2.15
near("wall: N = log M / (3 log p) for M = 1e9, p = 3 (Kohn: 6, eq. 2.14)", wallMaxN(3), 9 / (3 * Math.log10(3)), 1e-12);
near("wall: log10 of 3^300 (Kohn rounds to 150, eq. 2.15)", wallLog10(3, 100), 300 * Math.log10(3), 1e-12);
console.log(`      (3^300 = 10^${wallLog10(3, 100).toFixed(2)}; max N for 1e9 numbers and p = 3: ${wallMaxN(3).toFixed(2)})`);

// Lecture 1, Figure 1: model potential-energy curves
const morse = MODELS.morse, dbl = MODELS.double;
near("Morse: E(re) = -De", morse.E(morse.re), -morse.De, 1e-12);
near("Morse: dE/dR = 0 at re", morse.dE(morse.re) + 1, 1, 1e-12);
near("Morse: E -> 0 for separated atoms (R = 30 Å)", morse.E(30) + 1, 1, 1e-12);
for (const [m, xs] of [[morse, [1.0, 1.3, 2.0, 3.5]], [dbl, [-1.5, -0.4, 0.2, 1.3]]]) {
  for (const x of xs) {
    const h = 1e-6, num = (m.E(x + h) - m.E(x - h)) / (2 * h);
    near(`${m.label}: analytic dE/dx = numerical at x = ${x}`, m.dE(x), num, 1e-6);
  }
}
const relax = (m, x) => { let n = 0; while (Math.abs(m.dE(x)) >= FMAX && n < 60) { x = descend(m, x); n++; } return { x, n }; };
for (const [m, x0, lo, hi, what] of [[morse, morse.start, 1.45, 1.55, "Morse from 2.8 Å ends at re"],
                                      [dbl, 0.35, 0.9, 1.05, "two minima from 0.35 Å ends in the shallow right minimum"],
                                      [dbl, -0.3, -1.1, -0.95, "two minima from -0.3 Å ends in the deep left minimum"]]) {
  const r = relax(m, x0);
  const ok = r.x > lo && r.x < hi && r.n < 60;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"}  relaxation, ${what}: x = ${r.x.toFixed(4)} after ${r.n} steps`);
}
{
  const r = relax(dbl, 0.06);
  const ok = r.n === 0 && dbl.dE(0.06 + 1e-3) - dbl.dE(0.06 - 1e-3) < 0;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"}  relaxation, two minima from 0.06 Å stops at once on the barrier top (|F| = ${Math.abs(dbl.dE(0.06)).toFixed(4)} eV/Å, curvature < 0)`);
}
const right = relax(dbl, 0.35).x, left = relax(dbl, -0.3).x;
const deeper = dbl.E(left) < dbl.E(right);
if (!deeper) failed++;
console.log(`${deeper ? "ok  " : "FAIL"}  the left minimum (${dbl.E(left).toFixed(4)} eV) is deeper than the right (${dbl.E(right).toFixed(4)} eV)`);

// Lecture 2: particle in a box (unit length for the integrals)
const simpson = (f, a, b, n = 2000) => { const h = (b - a) / n; let s = f(a) + f(b); for (let i = 1; i < n; i++) s += f(a + i * h) * (i % 2 ? 4 : 2); return s * h / 3; };
near("box: E1 for an electron in 1 Å = h²/8mL² (CODATA 2022 m_e)", boxE(1, 1), (6.62607015e-34 ** 2) / (8 * 9.1093837139e-31 * 1e-20) / 1.602176634e-19, 1e-12);
near("box: E1 also equals π²ħ²/2mL²", boxE(1, 1), Math.PI ** 2 * (6.62607015e-34 / (2 * Math.PI)) ** 2 / (2 * 9.1093837139e-31 * 1e-20) / 1.602176634e-19, 1e-12);
console.log(`      (E1 = ${boxE(1, 1).toFixed(3)} eV for L = 1 Å; ${boxE(1, 5).toFixed(3)} eV for L = 5 Å)`);
near("box: E_n = n² E_1 (n = 3)", boxE(3, 5), 9 * boxE(1, 5), 1e-12);
for (const [m, n] of [[1, 1], [2, 2], [1, 2], [2, 3]]) {
  near(`box: overlap <psi${m}|psi${n}> = ${m === n ? 1 : 0}`, simpson(x => boxPsi(m, x) * boxPsi(n, x), 0, 1) + 1, (m === n ? 1 : 0) + 1, 1e-9);
}
for (const [n, a, b] of [[1, 0, 1], [2, 0.1, 0.4], [3, 0.25, 0.8]]) {
  near(`box: probability psi${n} between ${a} and ${b} (analytic vs numerical)`, boxProb(n, a, b), simpson(x => boxPsi(n, x) ** 2, a, b), 1e-9);
}
{
  const { c, P, meanE } = mixStats([0.8, 0.6, 0]);
  const psi = x => c.reduce((s, cn, i) => s + cn * boxPsi(i + 1, x), 0);
  const h = 1e-4, d2 = x => (psi(x + h) - 2 * psi(x) + psi(x - h)) / (h * h);
  // in units of E1, H = -(1/π²) d²/dx² for the unit box
  near("superposition: <E> = sum |c_n|² n² E1 equals the integral of psi* H psi", meanE, simpson(x => psi(x) * (-d2(x) / Math.PI ** 2), 1e-3, 1 - 1e-3), 1e-5);
  near("superposition: probabilities sum to 1", P.reduce((s, p) => s + p, 0), 1, 1e-12);
  near("superposition: equal mix of psi1 and psi2 gives <E> = 2.5 E1", mixStats([1, 1, 0]).meanE, 2.5, 1e-12);
}

// Lecture 3: variational trial energies, two-level mixing, Rayleigh-Ritz convergence
{
  const ho = TRIALS.ho, h = TRIALS.h;
  // check E(alpha) against direct numerical integrals of <phi|H|phi>/<phi|phi>
  const numHO = a => { const f = x => Math.exp(-a * x * x / 2), d2 = x => (f(x + 1e-4) - 2 * f(x) + f(x - 1e-4)) / 1e-8;
    return simpson(x => f(x) * (-0.5 * d2(x) + 0.5 * x * x * f(x)), -12, 12, 4000) / simpson(x => f(x) ** 2, -12, 12, 4000); };
  // hydrogen, radial: <T> = (1/2) int |dphi/dr|^2 r^2 dr, <V> = -int phi^2 r dr (atomic units)
  const numH = a => { const f = r => Math.exp(-a * r * r), df = r => -2 * a * r * f(r);
    const N = simpson(r => f(r) ** 2 * r * r, 0, 40, 8000);
    return (0.5 * simpson(r => df(r) ** 2 * r * r, 0, 40, 8000) - simpson(r => f(r) ** 2 * r, 0, 40, 8000)) / N; };
  for (const a of [0.3, 1, 2.5]) near(`trial: oscillator E(${a}) analytic vs numerical`, ho.E(a), numHO(a), 1e-6);
  for (const a of [0.1, 0.2829, 1]) near(`trial: hydrogen Gaussian E(${a}) analytic vs numerical`, h.E(a), numH(a), 1e-6);
  near("trial: oscillator minimum is the exact 1/2 (hbar omega)", ho.E(ho.best), 0.5, 1e-12);
  near("trial: hydrogen Gaussian minimum is -4/(3 pi) Ha", h.E(h.best), -4 / (3 * Math.PI), 1e-12);
  console.log(`      (hydrogen single Gaussian: ${h.E(h.best).toFixed(5)} Ha, ${(100 * (h.E(h.best) + 0.5) / 0.5).toFixed(1)}% above -0.5 Ha)`);
  const grid = [...Array(200).keys()].map(i => 0.01 * 1.04 ** i);
  const okBound = grid.every(a => ho.E(a) >= 0.5 - 1e-12 && h.E(a) >= -0.5);
  if (!okBound) failed++;
  console.log(`${okBound ? "ok  " : "FAIL"}  trial: no alpha gives an energy below the exact ground state (both families)`);
  const [lo, hi] = twoLevel(1, 2, 0.2);
  near("two-level: H12 = 0.2 eV gives E- = (3 - sqrt(1.16))/2", lo, (3 - Math.sqrt(1.16)) / 2, 1e-12);
  near("two-level: H12 = 0.2 eV gives E+ = (3 + sqrt(1.16))/2", hi, (3 + Math.sqrt(1.16)) / 2, 1e-12);
  console.log(`      (E- = ${lo.toFixed(4)} eV, E+ = ${hi.toFixed(4)} eV)`);
  const e3 = eigh([[2, -1, 0], [-1, 2, -1], [0, -1, 2]]).values;
  near("Jacobi: eigenvalues of the 3x3 tridiagonal [2,-1] matrix are 2 - sqrt2, 2, 2 + sqrt2", e3[0] + e3[1] + e3[2] + e3[0], 6 + 2 - Math.SQRT2, 1e-12);
  near("Jacobi: lowest eigenvalue 2 - sqrt2", e3[0], 2 - Math.SQRT2, 1e-12);
  let prev = Infinity, mono = true;
  const ref = ritzSolve(24).E0;
  for (let M = 1; M <= 16; M++) { const e = ritzSolve(M).E0; if (e > prev + 1e-12 || e < ref - 1e-9) mono = false; prev = e; }
  if (!mono) failed++;
  console.log(`${mono ? "ok  " : "FAIL"}  Rayleigh-Ritz: E0(M) never increases with M and never falls below the converged value`);
  { // the walls can only raise the energy above the free harmonic well, and only slightly
    const hw = Math.sqrt(800) / Math.PI, ok = ref > hw && (ref - hw) / hw < 2e-5;
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"}  Rayleigh-Ritz: converged E0 is just above the free harmonic well, sqrt(800)/pi E1 (${((ref - hw) / hw * 100).toFixed(4)}% higher, from the walls)`);
  }
  console.log(`      (E0(1) = ${ritzSolve(1).E0.toFixed(3)}, E0(10) = ${ritzSolve(10).E0.toFixed(6)}, converged ${ref.toFixed(6)} E1)`);
  const err10 = ritzSolve(10).E0 - ref, ok10 = err10 > 0 && err10 < 1e-4;
  if (!ok10) failed++;
  console.log(`${ok10 ? "ok  " : "FAIL"}  Rayleigh-Ritz: ten functions are within 1e-4 E1 (error ${err10.toExponential(2)})`);
}

// Lecture 4: hydrogen radial functions and titanium's datasets
near("hydrogen: R_10 = 2 e^-r at r = 1", radial(1, 0, 1), 2 * Math.exp(-1), 1e-12);
near("hydrogen: R_21 = r e^(-r/2) / (2 sqrt 6) at r = 3", radial(2, 1, 3), 3 * Math.exp(-1.5) / (2 * Math.sqrt(6)), 1e-12);
for (const [n, l] of [[1, 0], [3, 0], [3, 2], [4, 1], [4, 3]]) {
  near(`hydrogen ${n}${"spdf"[l]}: normalized`, simpson(r => (radial(n, l, r) * r) ** 2, 0, 120, 12000), 1, 1e-8);
  near(`hydrogen ${n}${"spdf"[l]}: <r> = (3n² - l(l+1))/2 bohr`, simpson(r => radial(n, l, r) ** 2 * r ** 3, 0, 150, 15000), meanR(n, l), 1e-7);
  let nodes = 0;
  for (let i = 1; i <= 6000; i++) { const a = 60 * (i - 1) / 6000 + 1e-6, b = 60 * i / 6000; if (Math.sign(radial(n, l, a)) !== Math.sign(radial(n, l, b))) nodes++; }
  const ok = nodes === n - l - 1;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"}  hydrogen ${n}${"spdf"[l]}: ${nodes} radial nodes = n - l - 1`);
}
near("hydrogen: P_2(x) = (3x² - 1)/2 at x = 0.3", legendre(2, 0.3), (3 * 0.09 - 1) / 2, 1e-12);
near("hydrogen: E_1 = -1 Ry = -E_h/2 (CODATA 2022)", levelE(1), -27.211386245981 / 2, 1e-11);
near("titanium: shells hold 22 electrons", TI_SHELLS.reduce((s, [, n]) => s + n, 0), 22, 0);
for (const [k, s] of Object.entries(TI_SETS)) {
  const val = TI_SHELLS.filter(([n]) => s.valence.includes(n)).reduce((a, [, n]) => a + n, 0);
  near(`titanium ${k}: valence shells hold ZVAL = ${s.zval} electrons (atom's ground configuration)`, val, s.zval, 0);
}

// Lecture 5: helium numbers, two electrons in a box, storage arithmetic
{
  const Ha = 27.211386245981;
  near("helium: non-interacting energy -Z² Ha = -108.8 eV (MIT 5.61 L22)", -4 * Ha, -108.8, 2e-3);
  near("helium: chart value, non-interacting", HELIUM[0].e, -108.8, 1e-12);
  near("helium: 24.6 + 54.4 eV to remove both electrons = 79.0 eV", 24.6 + 54.4, -HELIUM[2].e, 1e-12);
  near("helium: first-order repulsion 5Z/8 Ha = 34 eV", 5 * 2 / 8 * Ha, 34, 1e-2);
  near("helium: -108.8 + 34 = -74.8 eV", -108.8 + 34, HELIUM[1].e, 1e-12);
  // antisymmetry and normalization of the two-electron box states
  const sw = [[0.2, 0.7], [0.41, 0.13], [0.9, 0.35]].every(([a, b]) => Math.abs(pairPsi("anti", a, b) + pairPsi("anti", b, a)) < 1e-12 && Math.abs(pairPsi("sym", a, b) - pairPsi("sym", b, a)) < 1e-12);
  if (!sw) failed++;
  console.log(`${sw ? "ok  " : "FAIL"}  pair: antisymmetric changes sign and symmetric does not when x1 and x2 swap`);
  const n2 = m => { let s = 0; const n = 400, h = 1 / n; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) s += pairPsi(m, (i + .5) * h, (j + .5) * h) ** 2 * h * h; return s; };
  for (const m of ["product", "sym", "anti"]) near(`pair: ${m} state normalized`, n2(m), 1, 1e-6);
  const pp = closeProb("product"), pa = closeProb("anti"), ps = closeProb("sym");
  const ok = pa < pp / 3 && ps > pp;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"}  pair: P(|x1-x2| < 0.1 L) product ${pp.toFixed(4)}, antisymmetric ${pa.toFixed(4)} (${(pp / pa).toFixed(1)}x smaller), symmetric ${ps.toFixed(4)}`);
  near("storage: 8 electrons, 10 points per coordinate -> 10^24 values", psiLog10(8, 10), 24, 1e-12);
}

// Lecture 6: Hartree-Fock for helium in Gaussian basis sets
{
  const r12 = heliumHF(12);
  near("helium HF: 12 Gaussians within 1e-5 Ha of the HF limit (Hatano & Yamamoto 2020)", r12.E, HF_LIMIT, 1e-5 / 2.86);
  let prev = Infinity, mono = true;
  for (let M = 1; M <= 12; M++) { const e = heliumHF(M).E; if (e > prev + 1e-10 || e < HF_LIMIT - 1e-9) mono = false; prev = e; }
  if (!mono) failed++;
  console.log(`${mono ? "ok  " : "FAIL"}  helium HF: converged energy never rises with M and never drops below the HF limit`);
  const s = heliumSCF(10), first = s.step().E;
  near("helium HF: first iteration (bare-nucleus orbitals) reproduces -Z² + 5Z/8 = -2.75 Ha", first, -2.75, 1e-3);
  let k = 1; while (Math.abs(s.step().dE) >= 1e-8) k++;
  const fast = k + 1 <= 7;
  if (!fast) failed++;
  console.log(`${fast ? "ok  " : "FAIL"}  helium HF: M = 10 self-consistent (|dE| < 1e-8 Ha) by iteration ${k + 1} ("about seven")`);
  // hydrogen-like trial 1s e^{-zeta r}: E(zeta) = zeta^2 - 2 Z zeta + 5 zeta / 8, best zeta = Z - 5/16
  const Ez = z => z * z - 4 * z + 5 * z / 8;
  near("helium: hydrogen-like orbital, zeta = 2 gives -2.75 Ha", Ez(2), -2.75, 1e-12);
  near("helium: best zeta = 27/16 gives -(27/16)^2 = -2.8477 Ha", Ez(27 / 16), -2.84765625, 1e-12);
  const order = Ez(2) > Ez(27 / 16) && Ez(27 / 16) > HF_LIMIT && HF_LIMIT > E_EXACT;
  if (!order) failed++;
  console.log(`${order ? "ok  " : "FAIL"}  helium: -2.75 > -2.8477 > HF limit > exact (each step more flexible)`);
  near("helium: experiment from NIST ionization energies = -2.9034 Ha", E_EXP, -2.903386, 1e-6);
  near("helium: exact (nonrelativistic) and measured totals agree to 0.012%", E_EXACT, E_EXP, 1.2e-4);
  near("helium: HF recovers 98.6% of the exact energy", 100 * HF_LIMIT / E_EXACT, 98.55, 1e-3);
  near("helium: E_corr = E_exact - E_HF = -0.0420 Ha = -1.14 eV", (E_EXACT - HF_LIMIT) * HA_EV, -1.144, 1e-3);
  // Koopmans bookkeeping: He+ is hydrogen-like, exactly -Z^2/2 = -2 Ha
  near("helium: relaxed IE from separate He+ (E = -2 Ha) = 23.45 eV", (-2 - HF_LIMIT) * HA_EV, 23.448, 1e-4);
  near("helium: exact IE = 24.59 eV, measured 24.587 eV", (-2 - E_EXACT) * HA_EV, 24.5874, 3e-4);
  near("helium: Koopmans error = +1.53 (frozen) - 1.14 (correlation) = +0.39 eV", -r12.eps * HA_EV - (-2 - E_EXACT) * HA_EV, 0.387, 3e-3);
  near("helium HF: Koopmans -eps_1s = 24.98 eV", -r12.eps * HA_EV, 24.98, 2e-4);
  near("helium HF: J(1s,1s) = 1.026 Ha, i.e. E = 2h + J with eps = h + J (self-consistent to 1e-6)", r12.J, 2 * r12.eps - r12.E, 1e-6);
  near("helium HF: one-electron energy h = E - eps = -1.944 Ha", r12.E - r12.eps, -1.9437, 1e-4);
  console.log(`      (J = ${r12.J.toFixed(4)} Ha = ${(r12.J * HA_EV).toFixed(1)} eV; iterations to converge: ${r12.iterations})`);
}

console.log(failed ? `\n${failed} check(s) failed.` : "\nAll checks passed.");
process.exit(failed ? 1 : 0);
