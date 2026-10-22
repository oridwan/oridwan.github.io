/* ==========================================================================
   Figures for the guide page (symmetry/index.html) and the space-group browser.
   ========================================================================== */
(function () {
  'use strict';

  const C = window.SGCore, M = C.math;
  const $ = s => document.querySelector(s);
  const NS = 'http://www.w3.org/2000/svg';
  const COLOR = { ink: '#0f1b2d', muted: '#8a93a3', line: '#d5dbe4', soft: '#edf3fb', accent: '#1d4f91', right: '#1d4f91', left: '#c8651f', axis: '#0e7c7b', plane: '#7a55c7' };
  const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function svgEl(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  const pts = list => list.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
  function svgPoint(svg, ev) {
    const p = svg.createSVGPoint();
    p.x = ev.clientX; p.y = ev.clientY;
    const q = p.matrixTransform(svg.getScreenCTM().inverse());
    return [q.x, q.y];
  }
  // A small flag: asymmetric, so its mirror image is recognisably different.
  const FLAG = [[0, 0], [0, -30], [21, -24], [6, -17], [6, 0]];

  // Segmented button bar helper.
  function segBar(host, items, onPick, initial) {
    host.insertAdjacentHTML('afterbegin', items.map(it => `<button type="button" data-id="${it.id}">${it.label}</button>`).join(''));
    const pick = id => {
      host.querySelectorAll('button[data-id]').forEach(b => b.classList.toggle('on', b.dataset.id === id));
      onPick(id);
    };
    host.addEventListener('click', e => { const b = e.target.closest('button[data-id]'); if (b) pick(b.dataset.id); });
    pick(initial || items[0].id);
  }

  // ======================================================================
  // Figure 1: lattice and motif (2D)
  // ======================================================================
  (function fig1() {
    const svg = $('#fig1');
    const st = { a: 96, b: 80, g: 75, x: 0.3, y: 0.38 };
    const O = [230, 255];
    let dragging = false;

    function basis() {
      const g = st.g * Math.PI / 180;
      return [[st.a, 0], [st.b * Math.cos(g), -st.b * Math.sin(g)]];
    }
    function draw() {
      const [av, bv] = basis();
      const P = (u, v) => [O[0] + u * av[0] + v * bv[0], O[1] + u * av[1] + v * bv[1]];
      svg.textContent = '';
      const grid = svgEl('g', { stroke: COLOR.line, 'stroke-width': 1, fill: 'none' }, svg);
      const R = 9;
      for (let i = -R; i <= R; i++) {
        svgEl('line', { x1: P(i, -R)[0], y1: P(i, -R)[1], x2: P(i, R)[0], y2: P(i, R)[1] }, grid);
        svgEl('line', { x1: P(-R, i)[0], y1: P(-R, i)[1], x2: P(R, i)[0], y2: P(R, i)[1] }, grid);
      }
      svgEl('polygon', { points: pts([P(0, 0), P(1, 0), P(1, 1), P(0, 1)]), fill: COLOR.soft, stroke: COLOR.accent, 'stroke-width': 1.5 }, svg);
      const motifs = svgEl('g', {}, svg);
      for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) {
        const c = P(st.x + i, st.y + j);
        if (c[0] < -30 || c[0] > 670 || c[1] < -30 || c[1] > 410) continue;
        const home = i === 0 && j === 0;
        svgEl('polygon', {
          points: pts(FLAG.map(q => [c[0] + q[0] - 3, c[1] + q[1] + 12])),
          fill: home ? COLOR.accent : '#9db2d3', stroke: home ? COLOR.ink : 'none', 'stroke-width': 1,
          class: home ? 'drag' : ''
        }, motifs);
      }
      const lat = svgEl('g', { fill: COLOR.ink }, svg);
      for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) {
        const p = P(i, j);
        if (p[0] > -5 && p[0] < 645 && p[1] > -5 && p[1] < 385) svgEl('circle', { cx: p[0], cy: p[1], r: 2.4 }, lat);
      }
      arrow(P(0, 0), P(1, 0), 'a');
      arrow(P(0, 0), P(0, 1), 'b');
      $('#fig1r').innerHTML = `<i>x</i> = ${st.x.toFixed(2)}, <i>y</i> = ${st.y.toFixed(2)}`;
      $('#fig1c output').textContent = st.g + '°';
    }
    function arrow(p, q, name) {
      const d = [q[0] - p[0], q[1] - p[1]], L = Math.hypot(d[0], d[1]), u = [d[0] / L, d[1] / L], n = [-u[1], u[0]];
      const tip = q, base = [q[0] - 9 * u[0], q[1] - 9 * u[1]];
      svgEl('line', { x1: p[0], y1: p[1], x2: base[0], y2: base[1], stroke: COLOR.ink, 'stroke-width': 2 }, svg);
      svgEl('polygon', { points: pts([tip, [base[0] + 4 * n[0], base[1] + 4 * n[1]], [base[0] - 4 * n[0], base[1] - 4 * n[1]]]), fill: COLOR.ink }, svg);
      const t = svgEl('text', { x: (p[0] + q[0]) / 2 + 12 * (name === 'a' ? 0 : -1), y: (p[1] + q[1]) / 2 + (name === 'a' ? 18 : 0), class: 'svg-lbl' }, svg);
      t.textContent = name;
    }
    function moveTo(ev) {
      const [av, bv] = basis(), [X, Y] = svgPoint(svg, ev);
      const d = av[0] * bv[1] - av[1] * bv[0], rx = X - O[0], ry = Y - O[1] - 12;
      const u = (rx * bv[1] - ry * bv[0]) / d, v = (av[0] * ry - av[1] * rx) / d;
      st.x = ((u % 1) + 1) % 1;
      st.y = ((v % 1) + 1) % 1;
      draw();
    }
    svg.addEventListener('pointerdown', ev => { if (ev.target.classList.contains('drag')) { dragging = true; svg.setPointerCapture(ev.pointerId); } });
    svg.addEventListener('pointermove', ev => { if (dragging) moveTo(ev); });
    svg.addEventListener('pointerup', () => { dragging = false; });
    $('#fig1c').addEventListener('input', ev => { st[ev.target.dataset.k] = +ev.target.value; draw(); });
    draw();
  })();

  // ======================================================================
  // Figure 2: plane symmetry operations (2D)
  // ======================================================================
  (function fig2() {
    const svg = $('#fig2');
    const c = [320, 170];
    let op = '2', raf = 0;

    const rot = th => p => [c[0] + Math.cos(th) * (p[0] - c[0]) - Math.sin(th) * (p[1] - c[1]), c[1] + Math.sin(th) * (p[0] - c[0]) + Math.cos(th) * (p[1] - c[1])];
    const flipX = s => p => [c[0] + (1 - 2 * s) * (p[0] - c[0]), p[1]];
    const flipY = (s, shift) => p => [p[0] + shift, c[1] + (1 - 2 * s) * (p[1] - c[1])];
    const base = (dx, dy) => FLAG.map(q => [c[0] + dx + q[0], c[1] + dy + q[1]]);

    function shape(f, sign, ghost) {
      return svgEl('polygon', {
        points: pts(f), fill: sign > 0 ? COLOR.right : COLOR.left,
        'fill-opacity': ghost ? 0.35 : 0.9, stroke: ghost ? 'none' : '#fff', 'stroke-width': 1
      }, svg);
    }
    function element() {
      if (op === 'm') svgEl('line', { x1: c[0], y1: 20, x2: c[0], y2: 320, stroke: COLOR.plane, 'stroke-width': 2.5 }, svg);
      else if (op === 'g') svgEl('line', { x1: 20, y1: c[1], x2: 620, y2: c[1], stroke: COLOR.plane, 'stroke-width': 2.5, 'stroke-dasharray': '10 7' }, svg);
      else {
        const n = +op, r = 11;
        if (n === 2) svgEl('ellipse', { cx: c[0], cy: c[1], rx: 6, ry: 12, fill: COLOR.ink }, svg);
        else svgEl('polygon', {
          points: pts(Array.from({ length: n }, (_, k) => [c[0] + r * Math.sin(2 * Math.PI * k / n), c[1] - r * Math.cos(2 * Math.PI * k / n)])),
          fill: COLOR.ink
        }, svg);
      }
    }
    // Frame at time e (ms): static copies already produced plus a moving ghost.
    function frame(e) {
      svg.textContent = '';
      element();
      const D = 700, P = 260;
      if (op === 'm') {
        const p0 = base(60, 10), s = Math.min(1, Math.max(0, (e - P) / D));
        shape(p0, 1);
        if (s > 0 && s < 1) shape(p0.map(flipX(ease(s))), ease(s) < 0.5 ? 1 : -1, true);
        if (s >= 1) shape(p0.map(flipX(1)), -1);
        return s < 1;
      }
      if (op === 'g') {
        const T = 70, p0 = base(-12, -40);
        const steps = 3, k = Math.min(steps, Math.floor(Math.max(0, e - P) / (D + 200)));
        const s = Math.min(1, (Math.max(0, e - P) - k * (D + 200)) / D);
        for (let j = -3; j <= k; j++) shape(p0.map(flipY(Math.abs(j) % 2, j * T)), Math.abs(j) % 2 ? -1 : 1, j < 0);
        if (k < steps) {
          const a = ease(Math.min(1, s / 0.6)), b = ease(Math.max(0, (s - 0.6) / 0.4));
          const odd = k % 2;
          const f = p => { const q = flipY(odd, k * T)(p); return [q[0] + b * T, c[1] + (1 - 2 * a) * (q[1] - c[1])]; };
          shape(p0.map(f), (odd ? -1 : 1) * (a < 0.5 ? 1 : -1), true);
        }
        return k < steps;
      }
      const n = +op, p0 = base(78, 6), th = 2 * Math.PI / n;
      const k = Math.min(n - 1, Math.floor(Math.max(0, e - P) / (D + 150)));
      const s = Math.min(1, (Math.max(0, e - P) - k * (D + 150)) / D);
      for (let j = 0; j <= k; j++) shape(p0.map(rot(j * th)), 1);
      if (k < n - 1) { if (s > 0) shape(p0.map(rot((k + ease(s)) * th)), 1, true); return true; }
      return false;
    }
    function play() {
      cancelAnimationFrame(raf);
      const t0 = performance.now();
      const tick = now => { if (frame(reduceMotion ? 1e6 : now - t0)) raf = requestAnimationFrame(tick); };
      raf = requestAnimationFrame(tick);
    }
    $('#fig2c').addEventListener('click', ev => {
      const b = ev.target.closest('button');
      if (!b) return;
      if (b.dataset.op !== 'play') {
        op = b.dataset.op;
        $('#fig2c').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
      }
      play();
    });
    frame(0);
    observeOnce(svg, play);
  })();

  function observeOnce(node, fn) {
    const io = new IntersectionObserver(es => { if (es[0].isIntersecting) { io.disconnect(); fn(); } }, { threshold: 0.4 });
    io.observe(node);
  }

  if (!window.THREE) {
    document.querySelectorAll('.fig-3d').forEach(n => { n.innerHTML = '<p class="fig-note">The 3D figures need three.js, which did not load.</p>'; });
  } else {
    fig3();
    fig4();
    fig5();
  }

  // ======================================================================
  // Figure 3: symmetry operations in 3D
  // ======================================================================
  function fig3() {
    const cells = {
      tet: C.latticeMatrix({ a: 6.2, b: 6.2, c: 7, alpha: 90, beta: 90, gamma: 90 }, 'c'),
      hex: C.latticeMatrix({ a: 6.6, b: 6.6, c: 7, alpha: 90, beta: 90, gamma: 120 }, 'c')
    };
    const bar = s => `<span class="ob">${s}</span>`;
    const DEMOS = [
      { id: 'inv', label: bar(1), cell: 'tet', op: '-x+1,-y+1,-z+1', x: [0.8, 0.38, 0.26] },
      { id: 'r2', label: '2', cell: 'tet', op: '-x+1,-y+1,z', x: [0.8, 0.4, 0.3] },
      { id: 'r3', label: '3', cell: 'hex', op: '-y+1,x-y+1,z', x: [0.62, 0.84, 0.3] },
      { id: 'r4', label: '4', cell: 'tet', op: '-y+1,x,z', x: [0.8, 0.4, 0.3] },
      { id: 'r6', label: '6', cell: 'hex', op: 'x-y,x,z', x: [0.4, 0.1, 0.3], wrap: false },
      { id: 'm', label: '<i>m</i>', cell: 'tet', op: 'x,y,-z+1', x: [0.72, 0.4, 0.24] },
      { id: 'ri3', label: bar(3), cell: 'hex', op: 'y,-x+y,-z+1', x: [0.4, 0.1, 0.3], wrap: false },
      { id: 'ri4', label: bar(4), cell: 'tet', op: 'y,-x+1,-z+1', x: [0.8, 0.4, 0.3] },
      { id: 'ri6', label: bar(6), cell: 'hex', op: '-y,x-y,-z+1', x: [0.4, 0.1, 0.3], wrap: false },
      { id: 's21', label: '2<sub>1</sub>', cell: 'tet', op: '-x+1,-y+1,z+1/2', x: [0.8, 0.4, 0.2] },
      { id: 's31', label: '3<sub>1</sub>', cell: 'hex', op: '-y+1,x-y+1,z+1/3', x: [0.62, 0.84, 0.15] },
      { id: 's41', label: '4<sub>1</sub>', cell: 'tet', op: '-y+1,x,z+1/4', x: [0.8, 0.4, 0.15] },
      { id: 's42', label: '4<sub>2</sub>', cell: 'tet', op: '-y+1,x,z+1/2', x: [0.8, 0.4, 0.15] },
      { id: 's61', label: '6<sub>1</sub>', cell: 'hex', op: 'x-y,x,z+1/6', x: [0.4, 0.1, 0.15], wrap: false },
      { id: 'gc', label: '<i>c</i>', cell: 'tet', op: '-x+1,y,z+1/2', x: [0.76, 0.4, 0.2] },
      { id: 'gn', label: '<i>n</i>', cell: 'tet', op: '-x+1,y+1/2,z+1/2', x: [0.76, 0.2, 0.2] }
    ];
    const view = SGView.create($('#fig3'), { zoom: 1.0 });
    const orig = view.makeMotif(), image = view.makeMotif();
    view.scene.add(orig, image);
    let cell = null, current = null;

    function show(id) {
      const d = DEMOS.find(x => x.id === id);
      current = d;
      if (cell !== d.cell) { cell = d.cell; view.setLattice(cells[cell]); }
      view.clear();
      const A = view.A, o = C.parseOp(d.op), e = C.analyze(o.W, o.w, A, view.Ainv);
      const geom = C.geometryOf(e) || C.geometryOf(e, -0.5, 1.5);
      if (geom) view.root.add(view.elementObject(e, geom, true));
      view.poseMotif(orig, M.mv(A, d.x), M.I3());
      image.visible = false;
      const raw = M.add(M.mv(o.W, d.x), o.w), end = d.wrap === false ? raw : C.wrapv(raw);
      $('#fig3f').innerHTML = `<b>${C.nameOf(e)}</b>&emsp;<span class="m">(x, y, z) → (${C.fmtAffine(o.W, o.w)})</span>`;
      view.playOp(e, d.x, {
        title: C.nameOf(e), wrap: d.wrap !== false,
        onDone: () => { if (current !== d) return; view.poseMotif(image, M.mv(A, end), e.Wc); image.visible = true; }
      });
    }
    const host = $('#fig3c');
    host.innerHTML = '<button type="button" class="play">Replay</button>';
    host.querySelector('.play').addEventListener('click', () => show(current.id));
    segBar(host, DEMOS, id => { if (cell) show(id); }, 'inv');
    observeOnce($('#fig3'), () => show('inv'));
  }

  // ======================================================================
  // Figure 4: crystal systems
  // ======================================================================
  function fig4() {
    const SYS = {
      triclinic: { ops: ['-x,-y,-z'], keep: e => e.kind === 'inversion', rule: 'no constraints', sym: 'only 1 or 1̄; inversion centres shown' },
      monoclinic: { ops: ['-x,y,-z'], keep: () => true, rule: 'α = γ = 90°', sym: 'one 2-fold axis (or mirror normal), along b' },
      orthorhombic: { ops: ['-x,-y,z', '-x,y,-z', 'x,-y,-z'], keep: () => true, rule: 'α = β = γ = 90°', sym: 'three mutually perpendicular 2-fold axes' },
      tetragonal: { ops: ['-y,x,z'], keep: e => e.N === 4, rule: 'a = b; α = β = γ = 90°', sym: 'one 4-fold axis, along c' },
      trigonal: { ops: ['-y,x-y,z'], keep: () => true, rule: 'a = b; α = β = 90°, γ = 120° (hexagonal axes)', sym: 'one 3-fold axis, along c' },
      hexagonal: { ops: ['x-y,x,z'], keep: e => e.N === 6, rule: 'a = b; α = β = 90°, γ = 120°', sym: 'one 6-fold axis, along c' },
      cubic: { ops: ['z,x,y', 'z,-x,-y', '-z,-x,y', '-z,x,-y'], keep: e => e.N === 3, rule: 'a = b = c; α = β = γ = 90°', sym: 'four 3-fold axes, along the body diagonals' }
    };
    const view = SGView.create($('#fig4'));
    function show(sys) {
      const s = SYS[sys];
      view.setLattice(C.latticeMatrix(C.DISPLAY_CELL[sys], sys === 'monoclinic' ? 'b' : 'c'));
      view.clear();
      const A = view.A, Ainv = view.Ainv;
      const ops = ['x,y,z', ...s.ops].map(t => { const o = C.parseOp(t); o.e = C.analyze(o.W, o.w, A, Ainv); return o; });
      C.enumerateElements(ops, A, Ainv).filter(el => s.keep(el.e) && !el.e.screw).forEach(el => view.root.add(view.elementObject(el.e, el.geom, true)));
      const p = C.DISPLAY_CELL[sys];
      $('#fig4t').innerHTML = `<dt>Cell</dt><dd>${s.rule}</dd><dt>Minimal symmetry</dt><dd>${s.sym}</dd>
        <dt>Shown</dt><dd class="muted">a = ${p.a}, b = ${p.b}, c = ${p.c} Å; α = ${p.alpha}°, β = ${p.beta}°, γ = ${p.gamma}°</dd>`;
    }
    segBar($('#fig4c'), Object.keys(SYS).map(k => ({ id: k, label: k })), show, 'cubic');
  }

  // ======================================================================
  // Figure 5: Bravais lattices
  // ======================================================================
  function fig5() {
    const h = 0.5, t = 1 / 3;
    const CENT = { P: [], C: [[h, h, 0]], I: [[h, h, h]], F: [[h, h, 0], [h, 0, h], [0, h, h]], R: [[2 * t, t, t], [t, 2 * t, 2 * t]] };
    const LIST = [
      ['aP', 'triclinic', 'P'], ['mP', 'monoclinic', 'P'], ['mC', 'monoclinic', 'C'], ['oP', 'orthorhombic', 'P'], ['oC', 'orthorhombic', 'C'],
      ['oI', 'orthorhombic', 'I'], ['oF', 'orthorhombic', 'F'], ['tP', 'tetragonal', 'P'], ['tI', 'tetragonal', 'I'], ['hP', 'hexagonal', 'P'],
      ['hR', 'trigonal', 'R'], ['cP', 'cubic', 'P'], ['cI', 'cubic', 'I'], ['cF', 'cubic', 'F']
    ];
    const view = SGView.create($('#fig5'));
    function show(id) {
      const [, sys, L] = LIST.find(x => x[0] === id);
      view.setLattice(C.latticeMatrix(C.DISPLAY_CELL[sys], sys === 'monoclinic' ? 'b' : 'c'));
      view.clear();
      const base = [[0, 0, 0], ...CENT[L]], points = [];
      base.forEach(p => {
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
          const q = [p[0] + a, p[1] + b, p[2] + c];
          if (q.every(v => v > -1e-6 && v < 1 + 1e-6)) points.push(q);
        }
      });
      view.root.add(view.latticePoints(points.filter(q => q.every(v => Math.abs(v - Math.round(v)) < 1e-6)), 0x6b7588, 0.17));
      view.root.add(view.latticePoints(points.filter(q => !q.every(v => Math.abs(v - Math.round(v)) < 1e-6)), 0x1d4f91, 0.2));
      $('#fig5t').innerHTML = `<b>${id}</b>: ${sys}, ${L === 'P' ? 'primitive' : L + '-centred'}. ${C.LATTICE_LETTER[L]}
        The conventional cell holds <b>${base.length}</b> lattice point${base.length > 1 ? 's' : ''}: corner points count ⅛ each, face points ½.`;
    }
    segBar($('#fig5c'), LIST.map(([id]) => ({ id, label: id[0] + '<i>' + id[1] + '</i>' })), show, 'cF');
  }

  // ======================================================================
  // Figure 6: Hermann–Mauguin decoder
  // ======================================================================
  (function fig6() {
    const idx = window.SG_INDEX || [];
    const input = $('#hmIn'), out = $('#hmOut');
    $('#hmList').innerHTML = idx.map(g => `<option value="${g.n} ${g.s.replace(/_/g, '')}">`).join('');
    const norm = s => s.toLowerCase().replace(/[\s_]/g, '');
    function find(q) {
      q = q.trim();
      const m = q.match(/^(\d{1,3})\b/);
      if (m) return idx[+m[1] - 1];
      return idx.find(g => norm(g.s) === norm(q) || norm(g.f) === norm(q));
    }
    function render() {
      const g = find(input.value);
      if (!g) { out.innerHTML = input.value.trim() ? '<p class="muted">No match. Try a number from 1 to 230 or a symbol such as P2_1/c.</p>' : ''; return; }
      const d = C.decodeHM(g.f, g.sys);
      out.innerHTML = `<p class="decoder-head"><span class="big">${C.hmHTML(g.s)}</span> No. ${g.n} · ${g.sys} · full symbol <span class="m">${C.hmHTML(g.f)}</span></p>
        <table class="tbl decode"><thead><tr><th>Entry</th><th>Direction</th><th>Meaning</th></tr></thead><tbody>
        <tr><td class="m">${d.letter}</td><td>lattice</td><td>${d.letterWords}</td></tr>
        ${d.positions.map(p => `<tr class="${p.token === '1' ? 'muted' : ''}"><td class="m">${p.html}</td><td>${p.dir}</td><td>${p.words}</td></tr>`).join('')}
        </tbody></table>
        <p><a href="${g.n}/">Open the page for ${C.hmHTML(g.s)} →</a></p>`;
    }
    input.addEventListener('input', render);
    input.value = '62 Pnma';
    render();
  })();

  // ======================================================================
  // Figure 7: Wyckoff positions of p2mm
  // ======================================================================
  (function fig7() {
    const svg = $('#fig7');
    const X0 = 60, Y0 = 360, W = 300, H = 300;
    const S = (x, y) => [X0 + x * W, Y0 - y * H];
    const OPS = [
      { f: (x, y) => [x, y], L: [1, 1] }, { f: (x, y) => [-x, -y], L: [-1, -1] },
      { f: (x, y) => [-x, y], L: [-1, 1] }, { f: (x, y) => [x, -y], L: [1, -1] }
    ];
    const eq = (a, b) => Math.abs(a - b) < 1e-6;
    const WY = [
      { m: 4, l: 'i', s: '1', co: '(x, y) (x̄, ȳ) (x̄, y) (x, ȳ)', t: () => true },
      { m: 2, l: 'h', s: '.m.', co: '(½, y) (½, ȳ)', t: (x) => eq(x, 0.5) },
      { m: 2, l: 'g', s: '.m.', co: '(0, y) (0, ȳ)', t: (x) => eq(x, 0) },
      { m: 2, l: 'f', s: '..m', co: '(x, ½) (x̄, ½)', t: (x, y) => eq(y, 0.5) },
      { m: 2, l: 'e', s: '..m', co: '(x, 0) (x̄, 0)', t: (x, y) => eq(y, 0) },
      { m: 1, l: 'd', s: '2mm', co: '(½, ½)', t: (x, y) => eq(x, 0.5) && eq(y, 0.5) },
      { m: 1, l: 'c', s: '2mm', co: '(½, 0)', t: (x, y) => eq(x, 0.5) && eq(y, 0) },
      { m: 1, l: 'b', s: '2mm', co: '(0, ½)', t: (x, y) => eq(x, 0) && eq(y, 0.5) },
      { m: 1, l: 'a', s: '2mm', co: '(0, 0)', t: (x, y) => eq(x, 0) && eq(y, 0) }
    ];
    const st = { x: 0.27, y: 0.18 };
    let dragging = false;
    const wrap = v => { const r = v - Math.floor(v); return r > 1 - 1e-9 ? 0 : r; };

    $('#fig7t').innerHTML = '<thead><tr><th>Mult.</th><th>Letter</th><th>Site</th><th>Coordinates</th></tr></thead><tbody>' +
      WY.map(w => `<tr data-l="${w.l}"><td>${w.m}</td><td><i>${w.l}</i></td><td class="m">${w.s}</td><td class="m">${w.co}</td></tr>`).join('') + '</tbody>';

    function draw() {
      svg.textContent = '';
      svgEl('rect', { x: X0, y: Y0 - H, width: W, height: H, fill: COLOR.soft }, svg);
      const lines = svgEl('g', { stroke: COLOR.plane, 'stroke-width': 2.5 }, svg);
      [0, 0.5, 1].forEach(v => {
        svgEl('line', { x1: S(v, -0.08)[0], y1: S(v, -0.08)[1], x2: S(v, 1.08)[0], y2: S(v, 1.08)[1] }, lines);
        svgEl('line', { x1: S(-0.08, v)[0], y1: S(-0.08, v)[1], x2: S(1.08, v)[0], y2: S(1.08, v)[1] }, lines);
      });
      [0, 0.5, 1].forEach(u => [0, 0.5, 1].forEach(v => {
        const p = S(u, v);
        svgEl('ellipse', { cx: p[0], cy: p[1], rx: 5, ry: 9, fill: COLOR.ink }, svg);
      }));
      const ax = svgEl('text', { x: S(1.04, 0)[0], y: S(1.04, 0)[1] + 22, class: 'svg-lbl' }, svg); ax.textContent = 'a';
      const by = svgEl('text', { x: S(0, 1.04)[0] - 22, y: S(0, 1.04)[1], class: 'svg-lbl' }, svg); by.textContent = 'b';

      const images = OPS.map(o => o.f(st.x, st.y).map(wrap));
      const uniq = [];
      images.forEach(p => { if (!uniq.some(q => eq(q[0], p[0]) && eq(q[1], p[1]))) uniq.push(p); });
      OPS.forEach((o, i) => {
        const p = images[i];
        for (const dx of [0, 1]) for (const dy of [0, 1]) {
          const x = p[0] + dx, y = p[1] + dy;
          if (x > 1 + 1e-9 || y > 1 + 1e-9) continue;
          const c = S(x, y), sgn = o.L[0] * o.L[1];
          const shapePts = FLAG.map(q => [c[0] + 0.55 * q[0] * o.L[0], c[1] + 0.55 * q[1] * o.L[1]]);
          svgEl('polygon', { points: pts(shapePts), fill: sgn > 0 ? COLOR.right : COLOR.left, 'fill-opacity': 0.85 }, svg);
          svgEl('circle', { cx: c[0], cy: c[1], r: i === 0 && dx === 0 && dy === 0 ? 8 : 5, fill: i === 0 && dx === 0 && dy === 0 ? COLOR.ink : '#fff', stroke: COLOR.ink, 'stroke-width': 1.5, class: i === 0 && !dx && !dy ? 'drag' : '' }, svg);
        }
      });

      const w = WY.slice().reverse().find(v => v.t(st.x, st.y));
      document.querySelectorAll('#fig7t tbody tr').forEach(tr => tr.classList.toggle('sel', tr.dataset.l === w.l));
      $('#fig7s').innerHTML = `Point (${st.x.toFixed(2)}, ${st.y.toFixed(2)}): <b>${uniq.length}</b> ${uniq.length === 1 ? 'copy' : 'copies'} per cell, Wyckoff position <b>${w.m}<i>${w.l}</i></b>, site symmetry <b class="m">${w.s}</b>. ` +
        (w.m === 4 ? 'All four operations move the point.' : w.m === 2 ? 'The point lies on a mirror line, which maps it onto itself.' : 'The point lies on a 2-fold point where two mirror lines cross.');
    }
    function moveTo(ev) {
      const [X, Y] = svgPoint(svg, ev);
      let x = (X - X0) / W, y = (Y0 - Y) / H;
      x = Math.min(Math.max(x, 0), 1); y = Math.min(Math.max(y, 0), 1);
      const snap = v => { for (const s of [0, 0.5, 1]) if (Math.abs(v - s) < 0.03) return s % 1; return v % 1; };
      st.x = snap(x); st.y = snap(y);
      draw();
    }
    svg.addEventListener('pointerdown', ev => { dragging = true; svg.setPointerCapture(ev.pointerId); moveTo(ev); });
    svg.addEventListener('pointermove', ev => { if (dragging) moveTo(ev); });
    svg.addEventListener('pointerup', () => { dragging = false; });
    $('#fig7t').addEventListener('click', ev => {
      const tr = ev.target.closest('tr[data-l]');
      if (!tr) return;
      const set = { i: [0.27, 0.18], h: [0.5, 0.3], g: [0, 0.3], f: [0.27, 0.5], e: [0.27, 0], d: [0.5, 0.5], c: [0.5, 0], b: [0, 0.5], a: [0, 0] }[tr.dataset.l];
      st.x = set[0]; st.y = set[1];
      draw();
    });
    draw();
  })();

  // ======================================================================
  // Browser of the 230 groups
  // ======================================================================
  (function browse() {
    // The list itself is static HTML written by scripts/build_symmetry.py; this only filters it.
    const host = $('#browse');
    function filter() {
      const q = $('#q').value.trim().toLowerCase().replace(/_/g, ''), fc = $('#fC').checked, fk = $('#fK').checked;
      let n = 0;
      host.querySelectorAll('a').forEach(a => {
        const ok = (!q || (/^\d+$/.test(q) ? a.dataset.q.split(' ')[0] === q : a.dataset.q.includes(q))) &&
          (!fc || a.dataset.c === 'true') && (!fk || a.dataset.k === 'true');
        a.hidden = !ok;
        if (ok) n++;
      });
      host.querySelectorAll('.pg-row').forEach(r => { r.hidden = !r.querySelector('a:not([hidden])'); });
      host.querySelectorAll('.sys-block').forEach(s => { s.hidden = !s.querySelector('a:not([hidden])'); });
      $('#count').textContent = n === 230 ? '230 groups' : `${n} of 230`;
    }
    ['#q', '#fC', '#fK'].forEach(s => $(s).addEventListener('input', filter));
    filter();
  })();

  // Highlight the contents entry of the section in view.
  (function toc() {
    const links = [...document.querySelectorAll('.toc a')];
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) links.forEach(a => a.classList.toggle('on', a.hash === '#' + e.target.id));
    }), { rootMargin: '-20% 0px -70% 0px' });
    links.forEach(a => { const s = document.querySelector(a.hash); if (s) io.observe(s); });
  })();
})();
