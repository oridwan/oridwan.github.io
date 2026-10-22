/* ==========================================================================
   Space-group engine. Parses symmetry operations ("-x,y+1/2,-z+1/2") and
   works out what each one is geometrically: its axis / plane / centre and its
   screw or glide part. No DOM and no three.js, so it also runs under Node.
   Fractional vectors are [x,y,z]; 3x3 matrices are row-major nested arrays.
   ========================================================================== */
(function (root) {
  'use strict';

  // ---------- 3x3 linear algebra ----------
  const I3 = () => [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const Z3 = () => [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const mm = (A, B) => A.map(r => [0, 1, 2].map(j => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]));
  const mv = (A, v) => A.map(r => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]);
  const add = (a, b) => a.map((x, i) => x + b[i]);
  const sub = (a, b) => a.map((x, i) => x - b[i]);
  const scl = (a, s) => a.map(x => x * s);
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = a => Math.hypot(a[0], a[1], a[2]);
  const unit = a => scl(a, 1 / norm(a));
  const madd = (A, B, s = 1) => A.map((r, i) => r.map((x, j) => x + s * B[i][j]));
  const mscl = (A, s) => A.map(r => r.map(x => x * s));
  const T = A => [0, 1, 2].map(i => [0, 1, 2].map(j => A[j][i]));
  const det = A => dot(A[0], cross(A[1], A[2]));
  const trace = A => A[0][0] + A[1][1] + A[2][2];
  const inv = A => {
    const d = det(A);
    return T([cross(A[1], A[2]), cross(A[2], A[0]), cross(A[0], A[1])]).map(r => r.map(x => x / d));
  };
  const outer = (u, v) => u.map(a => v.map(b => a * b));
  const skew = u => [[0, -u[2], u[1]], [u[2], 0, -u[0]], [-u[1], u[0], 0]];
  const rodrigues = (u, th) =>
    madd(madd(mscl(I3(), Math.cos(th)), mscl(skew(u), Math.sin(th))), mscl(outer(u, u), 1 - Math.cos(th)));
  const meq = (A, B, tol = 1e-6) => A.every((r, i) => r.every((x, j) => Math.abs(x - B[i][j]) < tol));
  const veq = (a, b, tol = 1e-6) => a.every((x, i) => Math.abs(x - b[i]) < tol);

  // Unit vector spanning the 1-D null space of a rank-2 matrix.
  function nullVec(M) {
    let best = null, bn = 0;
    for (const [i, j] of [[0, 1], [0, 2], [1, 2]]) {
      const c = cross(M[i], M[j]), n = norm(c);
      if (n > bn) { bn = n; best = c; }
    }
    return bn > 1e-8 ? unit(best) : null;
  }
  // Minimum-norm least-squares solution of M x = b (M may be singular).
  const solveLS = (M, b) => { const Mt = T(M); return mv(inv(madd(mm(Mt, M), I3(), 1e-10)), mv(Mt, b)); };

  // ---------- numbers ----------
  const snap = v => { const r = Math.round(v * 48) / 48; return Math.abs(r - v) < 1e-5 ? r : v; };
  const wrap1 = v => { let r = v - Math.floor(v); if (r > 1 - 1e-7 || r < 1e-7) r = 0; return r; };
  const wrapv = v => v.map(wrap1);
  const wrapDiff = d => d.map(x => x - Math.round(x));
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  const FRAC = { '1/2': '½', '1/4': '¼', '3/4': '¾', '1/3': '⅓', '2/3': '⅔', '1/6': '⅙', '5/6': '⅚', '1/8': '⅛', '3/8': '⅜', '5/8': '⅝', '7/8': '⅞' };

  function fmtFrac(v) {
    if (Math.abs(v) < 1e-9) return '0';
    const s = v < 0 ? '−' : '';
    v = Math.abs(v);
    for (const d of [1, 2, 3, 4, 6, 8, 12, 24]) {
      const n = Math.round(v * d);
      if (Math.abs(n - v * d) < 1e-6) {
        if (d === 1) return s + n;
        const g = gcd(n, d), k = `${n / g}/${d / g}`;
        return s + (d / g === 1 ? n / g : (FRAC[k] || k));
      }
    }
    return s + v.toFixed(3);
  }
  const fmtNum = v => (v < -0.005 ? '−' : '') + Math.abs(v).toFixed(2);

  // Smallest integer vector parallel to v.
  function intDir(v) {
    const m = Math.max(...v.map(Math.abs));
    const u = v.map(x => x / m);
    for (let k = 1; k <= 12; k++) {
      if (u.every(x => Math.abs(x * k - Math.round(x * k)) < 1e-5)) return u.map(x => Math.round(x * k) || 0);
    }
    return u;
  }

  // ---------- operations ----------
  function parseOp(str) {
    const W = Z3(), w = [0, 0, 0];
    str.replace(/\s+/g, '').split(',').forEach((p, i) => {
      if (!/^[+-]/.test(p)) p = '+' + p;
      const re = /([+-])([^+-]+)/g;
      let m;
      while ((m = re.exec(p))) {
        const sign = m[1] === '-' ? -1 : 1, term = m[2], v = term.match(/[xyz]/);
        if (v) {
          const coef = term.replace(/[xyz*]/g, '');
          W[i]['xyz'.indexOf(v[0])] += sign * (coef === '' ? 1 : num(coef));
        } else {
          w[i] += sign * num(term);
        }
      }
    });
    return { W, w, str };
  }
  function num(s) { if (s.includes('/')) { const [a, b] = s.split('/'); return +a / +b; } return +s; }

  // "−x, y+½, −z+½" from (W, w). `vars` names the three columns.
  function fmtAffine(W, w, vars = 'xyz') {
    return W.map((row, i) => {
      let s = '';
      row.forEach((c, j) => {
        if (Math.abs(c) < 1e-9) return;
        s += (c < 0 ? '−' : '+') + (Math.abs(Math.abs(c) - 1) < 1e-9 ? '' : fmtFrac(Math.abs(c))) + vars[j];
      });
      if (Math.abs(w[i]) > 1e-9 || !s) s += (w[i] < 0 ? '−' : '+') + fmtFrac(Math.abs(w[i]));
      return s.replace(/^\+/, '');
    }).join(', ');
  }

  // Columns of the returned matrix are the cell vectors a, b, c (Cartesian, Å).
  // `up` names the cell axis shown vertically (three.js uses +Y as up).
  function latticeMatrix({ a, b, c, alpha, beta, gamma }, up = 'c') {
    const r = Math.PI / 180;
    const ca = Math.cos(alpha * r), cb = Math.cos(beta * r), cg = Math.cos(gamma * r), sg = Math.sin(gamma * r);
    const cx = c * cb, cy = c * (ca - cb * cg) / sg, cz = Math.sqrt(c * c - cx * cx - cy * cy);
    let A = T([[a, 0, 0], [b * cg, b * sg, 0], [cx, cy, cz]]);
    // Standard setting puts b along +Y already; for c-up rotate Z → Y.
    if (up === 'c') A = mm([[1, 0, 0], [0, 0, 1], [0, -1, 0]], A);
    return A;
  }

  const PROPER_ORDER = { 3: 1, 2: 6, 1: 4, 0: 3, '-1': 2 };
  const IMPROPER_ORDER = { '-3': 2, '-2': 6, '-1': 4, 0: 6, 1: 2 };
  const ROTOINV_N = { '-2': 6, '-1': 4, 0: 3 };

  /* Geometric meaning of the operation (W, w) in a lattice A.
     kind: identity | translation | rotation | inversion | mirror | rotoinversion.
     pf/p: a fixed point of the element (fractional / Cartesian), axis: Cartesian
     unit vector (rotation sense +theta), t/tc: intrinsic screw or glide part. */
  function analyze(W, w, A, Ainv) {
    const d = Math.round(det(W)), tr = Math.round(trace(W)), proper = d === 1;
    const order = proper ? PROPER_ORDER[tr] : IMPROPER_ORDER[tr];
    let S = Z3(), P = I3();
    for (let k = 0; k < order; k++) { S = madd(S, P); P = mm(P, W); }
    const t = mv(S, w).map(x => snap(x / order));
    const wl = sub(w, t);
    const Wc = mm(mm(A, W), Ainv);
    const ImW = madd(I3(), W, -1);
    const e = { W, w, Wc, det: d, order, t, tc: mv(A, t) };

    if (proper && order === 1) {
      e.kind = norm(t) < 1e-9 ? 'identity' : 'translation';
    } else if (proper) {
      e.kind = 'rotation'; e.N = order; e.theta = 2 * Math.PI / order;
      let u = nullVec(madd(Wc, I3(), -1));
      if (!meq(rodrigues(u, e.theta), Wc, 1e-6)) u = scl(u, -1);
      e.axis = u;
      e.uf = intDir(mv(Ainv, u));
      e.pf = solveLS(ImW, wl).map(snap); e.p = mv(A, e.pf);
      const period = norm(mv(A, e.uf));
      const k = Math.round(order * dot(e.tc, u) / period);
      e.screw = ((k % order) + order) % order;
    } else if (tr === -3) {
      e.kind = 'inversion';
      e.pf = w.map(x => snap(x / 2)); e.p = mv(A, e.pf);
    } else if (tr === 1) {
      e.kind = 'mirror';
      e.normal = nullVec(madd(Wc, I3(), 1));
      e.pf = solveLS(ImW, wl).map(snap); e.p = mv(A, e.pf);
      e.h = ImW.reduce((b, r) => (norm(r) > norm(b) ? r : b), [0, 0, 0]);
      e.d = dot(e.h, e.pf);
      e.g = t.map(x => snap(x - Math.round(x)));           // glide reduced to (−½, ½]
      const nz = [0, 1, 2].filter(i => Math.abs(e.g[i]) > 1e-6);
      e.glide = nz.length === 0 ? 'm'
        : nz.length === 1 ? 'abc'[nz[0]]
          : nz.every(i => Math.abs(Math.abs(e.g[i]) - 0.5) < 1e-6) ? 'n' : 'd';
    } else {
      e.kind = 'rotoinversion'; e.N = ROTOINV_N[tr]; e.theta = 2 * Math.PI / e.N;
      let u = nullVec(madd(Wc, I3(), 1));
      if (!meq(rodrigues(u, e.theta), mscl(Wc, -1), 1e-6)) u = scl(u, -1);
      e.axis = u;
      e.uf = intDir(mv(Ainv, u));
      e.pf = solveLS(ImW, w).map(snap); e.p = mv(A, e.pf);
    }
    return e;
  }

  // ---------- words ----------
  const SUB = '₀₁₂₃₄₅₆';
  const bar = s => `<span class="ob">${s}</span>`;
  const dirName = uf => {
    const k = uf.findIndex(x => x !== 0);
    if (uf.filter(x => x !== 0).length === 1) return 'abc'[k];
    return `[${uf.map(x => (x < 0 ? bar(-x) : x)).join('')}]`;
  };

  function symHTML(e) {
    switch (e.kind) {
      case 'identity': return '1';
      case 'translation': return 't';
      case 'inversion': return bar(1);
      case 'rotation': return e.N + (e.screw ? `<sub>${e.screw}</sub>` : '');
      case 'rotoinversion': return bar(e.N);
      case 'mirror': return e.glide;
    }
    return '?';
  }
  function symText(e) {
    switch (e.kind) {
      case 'inversion': return '-1';
      case 'rotation': return e.N + (e.screw ? SUB[e.screw] : '');
      case 'rotoinversion': return '-' + e.N;
      case 'mirror': return e.glide;
      case 'translation': return 't';
    }
    return '1';
  }
  function nameOf(e) {
    switch (e.kind) {
      case 'identity': return 'Identity';
      case 'translation': return 'Centring translation';
      case 'inversion': return 'Inversion centre';
      case 'rotation': return `${e.N}-fold ${e.screw ? 'screw' : 'rotation'} axis`;
      case 'rotoinversion': return `${e.N}-fold rotoinversion axis`;
      case 'mirror': return e.glide === 'm' ? 'Mirror plane' : `${e.glide}-glide plane`;
    }
    return '';
  }

  // Where the element sits, written the way the International Tables do it.
  function whereOf(e) {
    if (e.kind === 'inversion' || e.kind === 'rotoinversion') return e.pf.map(fmtFrac).join(', ');
    if (e.kind === 'rotation') {
      const i = e.uf.findIndex(x => x !== 0);
      const p = sub(e.pf, scl(e.uf, e.pf[i] / e.uf[i]));
      const W = Z3(); [0, 1, 2].forEach(j => { W[j][i] = e.uf[j] / e.uf[i]; });
      return fmtAffine(W, p);
    }
    if (e.kind === 'mirror') {
      let i = 2; while (Math.abs(e.h[i]) < 1e-9) i--;
      const W = I3(), w = [0, 0, 0];
      W[i] = e.h.map((h, j) => (j === i ? 0 : -h / e.h[i]));
      w[i] = e.d / e.h[i];
      return fmtAffine(W, w);
    }
    return '';
  }

  // ---------- elements inside the cell ----------
  function clipLine(pf, uf, lo = 0, hi = 1) {
    let s0 = -Infinity, s1 = Infinity;
    for (let i = 0; i < 3; i++) {
      if (Math.abs(uf[i]) < 1e-9) {
        if (pf[i] < lo - 1e-6 || pf[i] > hi + 1e-6) return null;
      } else {
        let a = (lo - pf[i]) / uf[i], b = (hi - pf[i]) / uf[i];
        if (a > b) [a, b] = [b, a];
        s0 = Math.max(s0, a); s1 = Math.min(s1, b);
      }
    }
    if (s1 - s0 < 1e-6) return null;
    return [add(pf, scl(uf, s0)), add(pf, scl(uf, s1))];
  }

  // Corners of the polygon where the plane h·x = d cuts the box [lo,hi]^3 (unsorted).
  function clipPlane(h, d, lo = 0, hi = 1) {
    const pts = [];
    const push = p => { if (!pts.some(q => veq(p, q, 1e-6))) pts.push(p); };
    for (let ax = 0; ax < 3; ax++) {
      for (const u of [lo, hi]) for (const v of [lo, hi]) {
        const c0 = [0, 0, 0], c1 = [0, 0, 0];
        const [o1, o2] = [0, 1, 2].filter(k => k !== ax);
        c0[o1] = c1[o1] = u; c0[o2] = c1[o2] = v; c0[ax] = lo; c1[ax] = hi;
        const f0 = dot(h, c0) - d, f1 = dot(h, c1) - d;
        if (Math.abs(f0) < 1e-9) push(c0);
        if (Math.abs(f1) < 1e-9) push(c1);
        if (f0 * f1 < -1e-18) push(add(c0, scl(sub(c1, c0), f0 / (f0 - f1))));
      }
    }
    return pts.length >= 3 ? pts : null;
  }

  const inBox = (p, lo = 0, hi = 1) => p.every(x => x > lo - 1e-6 && x < hi + 1e-6);

  // Fractional geometry of an element clipped to a box, or null if it misses.
  function geometryOf(e, lo = 0, hi = 1) {
    if (e.kind === 'inversion') return inBox(e.pf, lo, hi) ? { point: e.pf } : null;
    if (e.kind === 'rotoinversion') {
      if (!inBox(e.pf, lo, hi)) return null;
      return { point: e.pf, line: clipLine(e.pf, e.uf, lo, hi) };
    }
    if (e.kind === 'rotation') { const l = clipLine(e.pf, e.uf, lo, hi); return l ? { line: l } : null; }
    if (e.kind === 'mirror') { const p = clipPlane(e.h, e.d, lo, hi); return p ? { plane: p } : null; }
    return null;
  }

  // Every symmetry element (from every operation + lattice shift) that touches the unit cell.
  function enumerateElements(ops, A, Ainv) {
    const out = [], seen = new Set();
    ops.forEach((op, i) => {
      if (op.e.kind === 'identity' || op.e.kind === 'translation') return;
      for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) for (let c = -2; c <= 2; c++) {
        const e = analyze(op.W, add(op.w, [a, b, c]), A, Ainv);
        const geom = geometryOf(e);
        if (!geom) continue;
        const key = [e.kind, symText(e), whereOf(e)].join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ op: i, e, geom, primary: a === 0 && b === 0 && c === 0 });
      }
    });
    // Where a screw axis lies on a rotation axis (or a glide plane on a mirror) only the simpler
    // element is drawn, as in the International Tables.
    const plain = new Set(out.filter(x => (x.e.kind === 'rotation' && !x.e.screw) || (x.e.kind === 'mirror' && x.e.glide === 'm'))
      .map(x => x.e.kind + (x.e.N || '') + whereOf(x.e)));
    return out.filter(x => !((x.e.screw || (x.e.kind === 'mirror' && x.e.glide !== 'm')) && plain.has(x.e.kind + (x.e.N || '') + whereOf(x.e))));
  }

  // ---------- orbits, Wyckoff positions, products ----------
  // Images of fractional point x under every op, grouped into clusters of coinciding copies.
  function orbit(ops, x, A) {
    const images = ops.map(o => wrapv(add(mv(o.W, x), o.w)));
    const dist = (p, q) => norm(mv(A, wrapDiff(sub(p, q))));
    const clusters = [];
    images.forEach((p, i) => {
      const c = clusters.find(cl => dist(images[cl[0]], p) < 0.02);
      if (c) c.push(i); else clusters.push([i]);
    });
    let minSep = Infinity;
    for (let i = 0; i < clusters.length; i++) for (let j = i + 1; j < clusters.length; j++) {
      minSep = Math.min(minSep, dist(images[clusters[i][0]], images[clusters[j][0]]));
    }
    return { images, clusters, minSep, stabilizer: clusters.find(c => c.includes(0)) };
  }

  // Does fractional point x lie on the coordinate triplet `op` (free x,y,z) up to a lattice shift?
  function onTriplet(op, x) {
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
      const rhs = sub(add(x, [a, b, c]), op.w);
      const v = solveLS(op.W, rhs);
      if (norm(sub(mv(op.W, v), rhs)) < 2e-3) return true;
    }
    return false;
  }
  // Most special Wyckoff position containing x.
  function matchWyckoff(wyckoff, x) {
    let best = null;
    for (const wy of wyckoff) {
      if (wy.parsed.some(t => onTriplet(t, x)) && (!best || wy.m < best.m)) best = wy;
    }
    return best;
  }

  // "Do ops[first], then ops[second]": which op is that, and what lattice shift is left over?
  function compose(ops, first, second) {
    const a = ops[first], b = ops[second];
    const W = mm(b.W, a.W), w = add(mv(b.W, a.w), b.w);
    const k = ops.findIndex(o => meq(o.W, W) && veq(wrapDiff(sub(w, o.w)), [0, 0, 0], 1e-6));
    return { index: k, shift: k < 0 ? null : sub(w, ops[k].w).map(Math.round) };
  }

  // Pure translations other than the identity (the centring vectors of C, I, F, R lattices).
  function centringVectors(ops) {
    return ops.filter(o => meq(o.W, I3()) && norm(o.w) > 1e-9).map(o => o.w);
  }

  // ---------- Hermann–Mauguin symbols ----------
  // 'P2_1/c' -> 'P2<sub>1</sub>/c', '-3' -> overbar 3
  const hmHTML = s => s.replace(/ /g, '\u202f').replace(/_(\d)/g, '<sub>$1</sub>').replace(/-(\d)/g, (m, d) => bar(d));

  // Cell used for drawing; real crystals of the group have their own parameters.
  const DISPLAY_CELL = {
    triclinic: { a: 5.6, b: 6.2, c: 6.8, alpha: 80, beta: 86, gamma: 74 },
    monoclinic: { a: 6, b: 7, c: 6.5, alpha: 90, beta: 107, gamma: 90 },
    orthorhombic: { a: 5.6, b: 6.6, c: 7.6, alpha: 90, beta: 90, gamma: 90 },
    tetragonal: { a: 6.2, b: 6.2, c: 7.6, alpha: 90, beta: 90, gamma: 90 },
    trigonal: { a: 6.6, b: 6.6, c: 7.4, alpha: 90, beta: 90, gamma: 120 },
    hexagonal: { a: 6.6, b: 6.6, c: 7.4, alpha: 90, beta: 90, gamma: 120 },
    cubic: { a: 7.2, b: 7.2, c: 7.2, alpha: 90, beta: 90, gamma: 90 }
  };

  // Symmetry directions named by each position of the full symbol (International Tables, Table 2.1.3.1).
  const HEX_DIRS = ['the c axis [001]', 'a, b and a+b ([100], [010], [110])', 'the directions [1̄10], [120] and [2̄1̄0]'];
  const SYMBOL_DIRS = {
    triclinic: ['every direction (there is no special direction)'],
    monoclinic: ['the a axis [100]', 'the b axis [010]', 'the c axis [001]'],
    orthorhombic: ['the a axis [100]', 'the b axis [010]', 'the c axis [001]'],
    tetragonal: ['the c axis [001]', 'a and b ([100], [010])', 'the face diagonals [110] and [1̄10]'],
    trigonal: HEX_DIRS,
    hexagonal: HEX_DIRS,
    cubic: ['the cube edges a, b, c', 'the four body diagonals ⟨111⟩', 'the six face diagonals ⟨110⟩']
  };
  const LATTICE_LETTER = {
    P: 'Primitive: lattice points only at the corners of the cell.',
    A: 'A-centred: an extra lattice point at the centre of each bc face, (0, ½, ½).',
    B: 'B-centred: an extra lattice point at the centre of each ac face, (½, 0, ½).',
    C: 'C-centred: an extra lattice point at the centre of each ab face, (½, ½, 0).',
    I: 'Body-centred (from German <i>innenzentriert</i>): an extra lattice point at the cell centre, (½, ½, ½).',
    F: 'Face-centred: extra lattice points at the centre of every face.',
    R: 'Rhombohedral: in hexagonal axes, extra lattice points at (⅔, ⅓, ⅓) and (⅓, ⅔, ⅔).'
  };
  const PLANE_WORDS = {
    m: 'mirror plane',
    a: 'a-glide plane (reflect, then slide ½ along a)',
    b: 'b-glide plane (reflect, then slide ½ along b)',
    c: 'c-glide plane (reflect, then slide ½ along c)',
    n: 'n-glide plane (reflect, then slide ½ along a face diagonal)',
    d: 'd-glide or “diamond” plane (reflect, then slide ¼ along a diagonal)',
    e: 'e-glide or double glide plane (two glides, along two directions, in the same plane)'
  };

  function axisWords(n, k, improper) {
    const deg = 360 / n;
    if (improper) return n === 1 ? 'centre of inversion' : `${n}-fold rotoinversion axis (turn ${deg}°, then invert through a point on the axis)`;
    if (n === 1) return '';
    if (k) return `${n}<sub>${k}</sub> screw axis (turn ${deg}° and slide ${k}/${n} of the repeat along the axis)`;
    return `${n}-fold rotation axis (turn ${deg}°)`;
  }

  // Break a full HM symbol ('P 1 2_1/c 1') into its lattice letter and one entry per symmetry direction.
  function decodeHM(full, system) {
    const parts = full.trim().split(/\s+/);
    const letter = parts.shift();
    const dirs = SYMBOL_DIRS[system] || [];
    const pos = parts.map((tok, i) => {
      const m = tok.match(/^(-?)(\d)(?:_(\d))?(?:\/([mabcnde]))?$/) || tok.match(/^()()()([mabcnde])$/);
      let words;
      if (!m) words = tok;
      else {
        const [, minus, n, k, plane] = m;
        const ax = n ? axisWords(+n, k ? +k : 0, minus === '-') : '';
        const pl = plane ? PLANE_WORDS[plane] : '';
        if (ax && pl) words = `${ax}, with a ${pl.replace(/ \(.*/, '')} perpendicular to it`;
        else if (pl) words = `${pl}, perpendicular to this direction`;
        else words = ax || 'no symmetry element along this direction';
      }
      return { token: tok, html: hmHTML(tok), dir: dirs[i] || '', words };
    });
    return { letter, letterWords: LATTICE_LETTER[letter] || '', positions: pos };
  }

  const SGCore = {
    math: { I3, mm, mv, add, sub, scl, dot, cross, norm, unit, madd, mscl, det, inv, rodrigues, outer, meq },
    parseOp, fmtAffine, fmtFrac, fmtNum, latticeMatrix, analyze, wrapv, wrapDiff,
    symHTML, symText, nameOf, whereOf, dirName, bar, geometryOf, enumerateElements,
    orbit, matchWyckoff, compose, centringVectors, hmHTML, decodeHM, DISPLAY_CELL, LATTICE_LETTER
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = SGCore;
  else root.SGCore = SGCore;
})(this);
