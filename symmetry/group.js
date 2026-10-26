/* ==========================================================================
   Space-group page. Opens on the whole group (general position + symmetry
   elements) with four views of it (Symmetry, Wyckoff positions, Operations,
   Symbol) and an optional step-by-step guided tour. Group data is embedded
   in the page (#sg-data) by scripts/build_symmetry.py.
   ========================================================================== */
(function () {
  'use strict';

  const C = window.SGCore;
  const { mv, add, sub, norm, inv, det } = C.math;
  const $ = s => document.querySelector(s);
  const NUM = i => `(${i + 1})`;
  const sym = C.symHTML;
  const siteHTML = s => s.replace(/-(\d)/g, (m, d) => C.bar(d));

  const D = JSON.parse($('#sg-data').textContent);
  if (!window.THREE) {
    $('#step').innerHTML = '<p>The 3D model needs the three.js library, which did not load. Check the connection and reload; the tables below work without it.</p>';
    return;
  }

  // ---------- group ----------
  const SYS = D.system;
  const UP = SYS === 'monoclinic' ? 'b' : 'c';
  const A = C.latticeMatrix(C.DISPLAY_CELL[SYS], UP);
  const Ainv = inv(A);
  const ops = D.ops.map(s => { const o = C.parseOp(s); o.e = C.analyze(o.W, o.w, A, Ainv); return o; });
  D.wyckoff.forEach(w => { w.parsed = w.coords.map(C.parseOp); });
  const centring = C.centringVectors(ops);
  const nc = centring.length + 1;
  const nRep = ops.length / nc;                       // ops are listed coset representatives first
  const centOps = ops.map((o, i) => i).filter(i => ops[i].e.kind === 'translation');
  const all = ops.map((o, i) => i);
  const opList = [...all.slice(1, nRep), ...centOps];
  const big = ops.length > 24;
  const anyImproper = ops.some(o => o.e.det < 0);

  // Coset representatives grouped by the kind of symmetry element (2, 2₁, m, c, -1, ...).
  const classes = [];
  for (let i = 1; i < nRep; i++) {
    const e = ops[i].e, key = C.symText(e);
    let c = classes.find(x => x.key === key);
    if (!c) classes.push(c = { key, e, ops: [] });
    c.ops.push(i);
  }
  const hasSlide = e => e.kind === 'translation' || (e.kind === 'rotation' && e.screw > 0) || (e.kind === 'mirror' && e.glide !== 'm');
  const plural = name => name.replace(/(axis)$/, 'axes').replace(/(plane|centre|translation)$/, '$1s');

  const symbolHTML = C.hmHTML(D.short);
  const fullHTML = C.hmHTML(D.full);

  // ---------- viewer ----------
  const viewerEl = $('#viewer');
  viewerEl.textContent = '';
  const view = SGView.create(viewerEl, { autoRotate: true });
  view.setLattice(A);
  view.setAutoRotate(true);
  view.motifScale = Math.max(0.35, Math.min(1, 0.5 * Math.cbrt(Math.abs(det(A)) / ops.length)));

  const copies = ops.map((o, i) => {
    const m = view.makeMotif();
    view.root.add(m);
    m.userData.label = view.addLabel('', String(i + 1), () => m.position);
    return m;
  });
  const elemRoot = new THREE.Group();
  view.root.add(elemRoot);

  // Every symmetry element in the cell, grouped into kinds (all 2-fold axes, all c-glides, ...).
  const elements = C.enumerateElements(ops, A, Ainv);
  elements.forEach(el => { el.key = C.symText(el.e); });
  const rank = e => (e.kind === 'rotation' ? (e.screw ? 10 : 0) + 6 - e.N
    : e.kind === 'rotoinversion' ? 20 + 6 - e.N : e.kind === 'mirror' ? (e.glide === 'm' ? 30 : 31) : 40);
  const kinds = [];
  elements.forEach(el => {
    let k = kinds.find(x => x.key === el.key);
    if (!k) kinds.push(k = { key: el.key, e: el.e, els: [], ops: (classes.find(c => c.key === el.key) || { ops: [] }).ops });
    k.els.push(el);
  });
  kinds.sort((a, b) => rank(a.e) - rank(b.e));

  function setElementVisible(el, on) {
    if (!on && !el.obj) return;
    if (!el.obj) { el.obj = view.elementObject(el.e, el.geom, false); elemRoot.add(el.obj); }
    el.obj.visible = on;
  }
  const focusCache = {};
  function focusFor(i) {
    if (focusCache[i] !== undefined) return focusCache[i];
    const e = ops[i].e, geom = C.geometryOf(e) || C.geometryOf(e, -1, 2);
    if (!geom) return (focusCache[i] = null);
    const obj = view.elementObject(e, geom, true);
    elemRoot.add(obj);
    const at = SGView.v3(view.centroid(geom));
    const lbl = view.addLabel('el ' + e.kind, `${sym(e)}&ensp;${C.whereOf(e)}`, () => at);
    return (focusCache[i] = { obj, lbl });
  }

  // ---------- state ----------
  // Generic trial points for placing the atom (declared before state, which calls pickStart).
  const SEEDS = [[0.19, 0.11, 0.31], [0.13, 0.27, 0.38], [0.31, 0.07, 0.17], [0.09, 0.22, 0.41], [0.36, 0.14, 0.03], [0.07, 0.17, 0.29]];
  const state = {
    x: pickStart(), mode: 'explore', tab: 'symmetry', step: 0, openKind: null,
    played: new Set(), sel: null, showClass: false, hidden: defaultHidden(), flash: -1, orb: null, timer: 0
  };

  function pickStart() {
    // the candidate whose copies stay farthest apart
    let best = null, sep = -1;
    for (const x of SEEDS) {
      const o = C.orbit(ops, x, A);
      if (o.clusters.length === ops.length && o.minSep > sep) { best = x; sep = o.minSep; }
    }
    return best || SEEDS[0];
  }

  // A small group shows every element; a large one starts with the most characteristic
  // kinds (highest-order axes first) up to about 30 elements, so the model stays readable.
  function defaultHidden() {
    const hidden = new Set();
    if (elements.length <= 40) return hidden;
    let used = 0;
    kinds.forEach((k, i) => {
      if (i === 0 || used + k.els.length <= 30) used += k.els.length;
      else hidden.add(k.key);
    });
    return hidden;
  }

  // A point of Wyckoff position w with exactly w.m distinct copies. Projecting the current atom
  // keeps the move small, but can land on a more special site (on x,x,z with x = 0 the atom sits
  // on the 4-fold axis); then the seed whose projected copies stay farthest apart is used.
  function placeOn(w) {
    const t = w.parsed[0], onW = x => C.wrapv(add(mv(t.W, x), t.w));
    const here = onW(state.x);
    if (C.orbit(ops, here, A).clusters.length === w.m) return here;
    let best = here, sep = -1;
    for (const s of SEEDS) {
      const x = onW(s), o = C.orbit(ops, x, A);
      if (o.clusters.length === w.m && o.minSep > sep) { best = x; sep = o.minSep; }
    }
    return best;
  }

  // ======================================================================
  // Views of the group (tabs) and the guided tour
  // ======================================================================
  const TABS = {
    symmetry: { render: renderSymmetryTab },
    wyckoff: { render: renderWyckoffTab },
    operations: { render: renderOperationsTab },
    symbol: { render: renderSymbolTab }
  };

  // What the 3D model shows in the current tab or tour step.
  function ctx() {
    if (state.mode === 'tour') return tour[state.step];
    const k = state.openKind && kinds.find(x => x.key === state.openKind);
    switch (state.tab) {
      case 'symmetry': return { atoms: () => all, elems: true, solo: k ? k.key : null, list: k && k.ops.length ? k.ops : null };
      case 'wyckoff': return { atoms: () => all, elems: true, sliders: true };
      case 'operations': return { atoms: () => all, list: opList, sliders: true, labels: true };
      default: return { atoms: () => all, elems: true };
    }
  }

  const tour = [
    { key: 'motif', title: 'A general point', atoms: () => [0], sliders: true, render: renderMotif },
    ...(centOps.length ? [{ key: 'centring', title: 'Lattice centring', atoms: () => [0, ...centOps.filter(i => state.played.has(i))], sliders: true, list: centOps, render: renderCentring }] : []),
    ...classes.map((c, k) => ({
      key: 'el-' + c.key.replace(/[^a-z0-9]/gi, m => ({ '-': 'bar', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5' })[m] || ''),
      title: `${sym(c.e)} ${plural(C.nameOf(c.e))}`, cls: c, list: c.ops, sliders: true,
      atoms: () => [0, ...classes.slice(0, k).flatMap(x => x.ops), ...c.ops.filter(i => state.played.has(i))],
      render: () => renderClass(c)
    })),
    { key: 'general-position', title: 'The general position', atoms: () => all, elems: true, sliders: true, labels: true, render: renderTogether },
    { key: 'products', title: 'Combining operations', atoms: () => all, sliders: true, labels: true, render: renderCombine },
    { key: 'wyckoff-positions', title: 'Wyckoff positions', atoms: () => all, elems: true, sliders: true, render: renderTourWyckoff }
  ];

  function setTab(tab, keepHash = false) {
    stopActivity();
    state.mode = 'explore';
    state.tab = tab;
    state.openKind = null;
    state.sel = null;
    renderPanel();
    if (!keepHash) history.replaceState(null, '', tab === 'symmetry' ? location.pathname : '#' + tab);
  }

  function goTour(k, keepHash = false) {
    stopActivity();
    if (state.mode !== 'tour') view.setAutoRotate(false);
    state.mode = 'tour';
    state.step = Math.max(0, Math.min(tour.length - 1, k));
    state.showClass = false;
    const s = tour[state.step];
    state.sel = s.list ? s.list[0] : null;
    renderPanel();
    if (!keepHash) history.replaceState(null, '', '#tour-' + s.key);
    if (s.list && !state.played.has(state.sel)) state.timer = setTimeout(() => play(state.sel), 700);
  }

  function stopActivity() {
    view.cancel();
    view.trailReset();
    clearTimeout(state.timer);
  }

  function renderPanel() {
    const inTour = state.mode === 'tour';
    $('#panelTop').hidden = inTour;
    $('#tourBar').hidden = !inTour;
    $('#stepNav').hidden = !inTour;
    document.querySelectorAll('.tabs [data-tab]').forEach(b => {
      const on = !inTour && b.dataset.tab === state.tab;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', on);
    });
    const body = $('#step');
    body.innerHTML = inTour ? tour[state.step].render() : TABS[state.tab].render();
    body.scrollTop = 0;
    if (inTour) {
      const k = state.step, prev = tour[k - 1], next = tour[k + 1];
      $('#tourCount').textContent = `Guided tour · step ${k + 1} of ${tour.length}`;
      $('#tourDots').innerHTML = tour.map((s, j) =>
        `<li><button type="button" data-k="${j}" class="${j === k ? 'on' : ''}" title="${s.title.replace(/<[^>]+>/g, '')}"><span class="visually-hidden">Step ${j + 1}</span></button></li>`).join('');
      $('#prev').innerHTML = prev ? `<span class="nav-k">Previous</span>${prev.title}` : '';
      $('#next').innerHTML = next ? `<span class="nav-k">Next</span>${next.title}` : '<span class="nav-k">Done</span>Back to the model';
      $('#prev').hidden = !prev;
    }
    refresh();
  }

  // ---------- tab: Symmetry ----------
  function swatch(e) {
    return e.kind === 'mirror' ? `<i class="sw plane ${e.glide !== 'm' ? 'glide' : ''}"></i>`
      : e.kind === 'rotation' ? `<i class="sw axis ${e.screw ? 'screw' : ''}"></i>` : '<i class="sw inv"></i>';
  }

  function renderSymmetryTab() {
    return `<p class="panel-lead">The ${ops.length} symmetry operations of ${symbolHTML} turn one atom into ${ops.length} copies per unit cell:
      <i class="sw r"></i> blue copies keep its handedness${anyImproper ? ', <i class="sw l"></i> orange copies are its mirror image' : ''}.
      Each operation acts through a symmetry element. One unit cell contains:</p>
      <ul class="kinds">${kinds.map(kindRow).join('')}</ul>
      <p class="note">Tick a box to show or hide that kind of element, select its name to read what it does, or press ▶ to watch one of its operations move atom 1.${
        state.hidden.size && !state.touchedKinds ? ' Some kinds start hidden to keep the model readable.' : ''}</p>`;
  }

  function kindRow(k) {
    const open = state.openKind === k.key, name = C.nameOf(k.e).toLowerCase();
    return `<li class="kind${open ? ' open' : ''}">
      <div class="kind-row">
        <input type="checkbox" data-act="kind" value="${k.key}" ${state.hidden.has(k.key) ? '' : 'checked'} aria-label="Show ${plural(name)}">
        ${swatch(k.e)}
        <button type="button" class="kind-name" data-act="openkind" data-key="${k.key}" aria-expanded="${open}"><span class="m">${sym(k.e)}</span>&ensp;${plural(C.nameOf(k.e))}</button>
        <span class="kind-n" title="Number in one unit cell">${k.els.length}</span>
        <button type="button" class="kind-play" data-act="playkind" data-key="${k.key}" aria-label="Play a ${name} operation">▶</button>
      </div>
      ${open ? `<div class="kind-body">
        <p>${whatItDoes(k.e)}</p>
        ${notes(k.e)}
        ${k.ops.length ? `<p>Operations of this kind in the list of ${symbolHTML}:</p>${opRows(k.ops)}<div class="formula" id="formula"></div>`
          : `<p class="note">These elements arise from combining other operations with the lattice centring; none of the listed coordinate triplets is of this kind.</p>`}
      </div>` : ''}
    </li>`;
  }

  // Play one element of kind k: the one closest to atom 1, so the motion is short and easy to follow.
  function playKind(key) {
    const k = kinds.find(x => x.key === key), p = mv(A, state.x);
    const el = k.els.reduce((best, x) => (norm(sub(view.centroid(x.geom), p)) < norm(sub(view.centroid(best.geom), p)) ? x : best));
    const raw = add(mv(el.e.W, state.x), el.e.w), img = C.wrapv(raw);
    const target = state.orb.images.findIndex(q => norm(mv(A, C.wrapDiff(sub(q, img)))) < 0.02);
    view.playOp(el.e, state.x, {
      title: `${C.symText(el.e)} ${C.nameOf(el.e).toLowerCase()} at ${C.whereOf(el.e)}`,
      onDone: () => flash(target)
    });
  }

  function flash(i) {
    if (i < 0) return;
    state.flash = i;
    refresh();
    view.caption(`Atom 1 lands on copy ${i + 1}`);
    setTimeout(() => { if (state.flash === i) { state.flash = -1; refresh(); } if (!view.anim) view.caption(''); }, 1800);
  }

  // ---------- tab: Wyckoff positions ----------
  function wyckRows() {
    return D.wyckoff.map(w => `<tr data-act="wyck" data-l="${w.l}"><td class="m">${w.m}</td><td class="m"><i>${w.l}</i></td><td class="m">${siteHTML(w.site)}</td><td class="m coords">${wyckCoords(w)}</td></tr>`).join('');
  }
  function renderWyckoffTab() {
    return `<p class="panel-lead">Select a row to move the atom onto that Wyckoff position, or drag the sliders under the model. On a special position some copies coincide, so there are fewer of them; the yellow halo marks merged copies.</p>
      <div class="scroll-x"><table class="tbl wyck"><thead><tr><th>Mult.</th><th>Letter</th><th>Site symmetry</th><th>Coordinates</th></tr></thead><tbody>${wyckRows()}</tbody></table></div>
      <p class="note"><b>Reading the table.</b> Multiplicity is the number of copies per cell; the letter runs from <i>a</i> (most special) to the general position; the site symmetry lists the operations that leave the point fixed, with a dot for a direction without symmetry. More in the <a href="../#wyckoff">introduction to Wyckoff positions</a>.</p>`;
  }

  // ---------- tab: Operations ----------
  function renderOperationsTab() {
    return `<p class="panel-lead">The coordinate triplets of ${symbolHTML}${nc > 1 ? `, listed once for the lattice point (0, 0, 0); the centring translations ${centring.map(t => `(${t.map(C.fmtFrac).join(', ')})`).join(', ')} add the rest` : ''}. Select one to watch it act on atom 1.</p>
      ${opRows(opList)}
      <div class="formula" id="formula"></div>
      ${combineBlock()}`;
  }

  // ---------- tab: Symbol ----------
  function renderSymbolTab() {
    const dec = C.decodeHM(D.full, SYS);
    const rows = [`<tr><td class="m">${dec.letter}</td><td>Lattice</td><td>${dec.letterWords}</td></tr>`]
      .concat(dec.positions.map(p => `<tr class="${p.token === '1' ? 'muted' : ''}"><td class="m">${p.html}</td><td>${p.dir}</td><td>${p.words}</td></tr>`));
    const yes = b => (b ? 'yes' : 'no');
    return `<p class="panel-lead">The full Hermann–Mauguin symbol <span class="m">${fullHTML}</span> gives the lattice type, then one entry for each symmetry direction of the ${SYS} system. The short symbol ${symbolHTML} leaves out entries that follow from the others.</p>
      <table class="tbl decode"><thead><tr><th>Entry</th><th>Direction</th><th>Meaning</th></tr></thead><tbody>${rows.join('')}</tbody></table>
      <dl class="facts">
        <dt>Crystal class</dt><dd><span class="m">${C.hmHTML(D.pointGroup)}</span> (${SYS})</dd>
        <dt>Centrosymmetric</dt><dd>${yes(D.centrosymmetric)}</dd>
        <dt>Sohncke group</dt><dd>${yes(D.sohncke)}${D.sohncke ? ': only rotations and screw rotations, so it can hold a single enantiomer of a chiral molecule' : ''}</dd>
        <dt>Polar</dt><dd>${yes(D.polar)}</dd>
        <dt>Setting</dt><dd>${settingWords()}</dd>
      </dl>
      <p class="note">New to the notation? See <a href="../#symbols">how Hermann–Mauguin symbols are read</a>.</p>`;
  }
  function settingWords() {
    const s = ['standard setting of the International Tables, Vol. A'];
    if (SYS === 'monoclinic') s.push('unique axis b, cell choice 1');
    if (D.choice === '2') s.push('origin choice 2 (origin at a centre of inversion)');
    if (D.choice === 'H') s.push('hexagonal axes');
    return s.join('; ');
  }

  // ---------- guided tour ----------
  function renderMotif() {
    return `<h2>A general point</h2>
      <p>Symmetry is easiest to see by following a single point. The model now shows one atom at fractional coordinates <i>(x, y, z)</i>. Each coordinate is a fraction of the corresponding cell edge, so <i>x</i> = 0.5 lies halfway along <i>a</i>. The sliders under the model move it.</p>
      <p>A sphere looks the same after any rotation, so the atom carries three arms of different length that act as a <b>handedness marker</b>. You can read it as the atom's local environment.</p>
      <dl class="facts">
        <dt><i class="sw r"></i> Blue</dt><dd>same handedness as the starting atom</dd>
        <dt><i class="sw l"></i> Orange</dt><dd>mirror image (opposite handedness)</dd>
      </dl>
      <p>Every symmetry operation of the group must map this atom onto an atom of the same kind. The next steps add the operations one kind at a time until all ${ops.length} copies are there.</p>`;
  }

  function opRows(list) {
    return `<table class="tbl ops"><thead><tr><th></th><th>Coordinates</th><th>Element</th><th>Location</th></tr></thead><tbody>${
      list.map(i => `<tr data-act="pick" data-i="${i}" class="${i === state.sel ? 'sel' : ''}">
        <td>${NUM(i)}</td><td class="m">${C.fmtAffine(ops[i].W, ops[i].w)}</td><td class="m">${sym(ops[i].e)}</td><td class="m">${C.whereOf(ops[i].e) || '—'}</td></tr>`).join('')
    }</tbody></table>`;
  }

  function renderCentring() {
    const L = D.short[0];
    return `<h2>Lattice centring</h2>
      <p>${C.LATTICE_LETTER[L] || ''} A translation by a centring vector maps the lattice onto itself, so it is a symmetry operation of the crystal. Every atom therefore has partners shifted by
      ${centring.map(t => `(${t.map(C.fmtFrac).join(', ')})`).join(', ')}.</p>
      ${opRows(centOps)}
      <div class="formula" id="formula"></div>
      <p class="note">The International Tables list only the first ${nRep} coordinate triplets and write the centring vectors in front of them, e.g. “(0, 0, 0)+ (½, ½, 0)+”.</p>`;
  }

  function whatItDoes(e) {
    const deg = e.N ? Math.round(360 / e.N) + '°' : '';
    const dir = e.uf ? `<i>${C.dirName(e.uf)}</i>` : '';
    switch (e.kind) {
      case 'inversion':
        return 'Each point is sent through a fixed point, the inversion centre, to the same distance on the opposite side. Measured from the centre, all three coordinates change sign.';
      case 'rotation':
        return e.screw
          ? `A rotation by ${deg} about an axis along ${dir}, combined with a translation of ${e.screw}/${e.N} of the lattice repeat along the same axis. In the symbol N<sub>k</sub>, the subscript k gives this translation in units of 1/N of the repeat.`
          : `A rotation by ${deg} about an axis along ${dir}. Applying it ${e.N} times returns every point to its starting position.`;
      case 'mirror': {
        if (e.glide === 'm') return 'A reflection in a plane.';
        const nz = [0, 1, 2].filter(i => Math.abs(e.g[i]) > 1e-6);
        const slide = nz.length === 1 ? `${C.fmtFrac(Math.abs(e.g[nz[0]]))} of the repeat along <i>${'abc'[nz[0]]}</i>`
          : `(${e.g.map(v => C.fmtFrac(Math.abs(v))).join(', ')}), along a diagonal of the plane`;
        return `A reflection in a plane followed by a translation of ${slide}, parallel to the plane. The letter <i>${e.glide}</i> names the glide direction.`;
      }
      case 'rotoinversion':
        return `A rotation by ${deg} about an axis along ${dir}, followed by inversion through a point on that axis. Neither step alone needs to be a symmetry of the crystal; only the combination is.`;
    }
    return '';
  }

  function notes(e, placeButton = false) {
    const hand = e.det < 0
      ? '<p class="note"><b>Handedness.</b> This operation produces a mirror image, so its copies are orange. Operations of this kind cannot occur in a crystal made of a single enantiomer of a chiral molecule.</p>'
      : '<p class="note"><b>Handedness.</b> Rotations and screw rotations preserve handedness, so the copies stay blue.</p>';
    const fixed = hasSlide(e)
      ? '<p class="note"><b>Fixed points.</b> Because of its translation part, this operation leaves no point in place. An atom can therefore never sit on a screw axis or glide plane as a special position.</p>'
      : `<p class="note"><b>Fixed points.</b> Points on the element are mapped onto themselves, so an atom placed there coincides with its own image.${placeButton ? ' <button type="button" class="link" data-act="place">Move the atom onto the element</button>' : ''}</p>`;
    return hand + fixed;
  }

  function renderClass(c) {
    const e = c.e, name = C.nameOf(e).toLowerCase();
    return `<h2>${sym(e)} ${plural(C.nameOf(e))}</h2>
      <p>${whatItDoes(e)}</p>
      <p>${c.ops.length === 1 ? 'One operation' : `${c.ops.length} operations`} of this kind ${c.ops.length === 1 ? 'is' : 'are'} listed for ${symbolHTML}. Select a row to play it on the atom.</p>
      ${opRows(c.ops)}
      <div class="formula" id="formula"></div>
      <label class="check"><input type="checkbox" data-act="showclass"> Show every ${name} in the unit cell</label>
      ${notes(e, true)}`;
  }

  function renderTogether() {
    const gen = D.wyckoff[0];
    return `<h2>The general position</h2>
      <p>Applying all ${ops.length} operations to the atom gives ${ops.length} copies per unit cell, the <b>general position</b> ${gen.m}<i>${gen.l}</i>. It is called general because <i>x</i>, <i>y</i> and <i>z</i> are free; its site symmetry is 1.</p>
      <p>The lattice repeats the symmetry elements as well, so one cell contains many copies of each. The model now shows them; the <b>Symmetry</b> view lists them by kind with a switch for each.</p>
      <p class="note">Viewed along a symmetry direction, this is the arrangement drawn in the space-group diagrams of the International Tables. Try the <i>along ${UP}</i> button on the model.</p>`;
  }

  function combineBlock() {
    const head = `<h3>Combining two operations</h3>
      <p>Performing one operation and then another is again an operation of the group, up to a lattice translation. This closure is what makes the set a <b>group</b>, and why the symbol only needs to name a few generators.</p>`;
    if (ops.length <= 8) {
      const th = ops.map((o, i) => `<th>${NUM(i)} ${sym(o.e)}</th>`).join('');
      const rows = ops.map((o, r) => `<tr><th>${NUM(r)} ${sym(o.e)}</th>${ops.map((p, c) => {
        const k = C.compose(ops, r, c).index;
        return `<td><button type="button" data-act="pair" data-r="${r}" data-c="${c}">${sym(ops[k].e)}<small>${NUM(k)}</small></button></td>`;
      }).join('')}</tr>`).join('');
      return `${head}<p>Rows give the first operation, columns the second. Select a cell to watch both applied in turn.</p>
        <div class="scroll-x"><table class="cayley"><thead><tr><th>first \\ then</th>${th}</tr></thead><tbody>${rows}</tbody></table></div>
        <p class="result" id="pairResult"></p>`;
    }
    const opt = sel => ops.map((o, i) => `<option value="${i}" ${i === sel ? 'selected' : ''}>${NUM(i)} ${C.symText(o.e)} · ${C.fmtAffine(o.W, o.w)}</option>`).join('');
    return `${head}<div class="pair-pick"><label>First <select id="pA">${opt(1)}</select></label><label>then <select id="pB">${opt(Math.min(2, ops.length - 1))}</select></label>
      <button type="button" class="btn-plain" data-act="pairpick">Apply both</button></div>
      <p class="result" id="pairResult"></p>`;
  }
  function renderCombine() {
    return `<h2>Combining operations</h2>${combineBlock().replace(/<h3>.*?<\/h3>/, '')}`;
  }

  function describePair(r, c) {
    const { index: k, shift } = C.compose(ops, r, c);
    let html = `${NUM(r)} ${sym(ops[r].e)} followed by ${NUM(c)} ${sym(ops[c].e)} equals <b>${NUM(k)} ${sym(ops[k].e)}</b>, ${C.nameOf(ops[k].e).toLowerCase()}`;
    html += shift.some(Boolean) ? `, plus the lattice translation (${shift.join(', ')}).` : '.';
    return html;
  }

  function wyckCoords(w) {
    const n = w.m / nc, shown = w.parsed.slice(0, Math.min(n, 8));
    const prefix = nc > 1 ? `<span class="cent">${['0,0,0', ...centring.map(t => t.map(C.fmtFrac).join(','))].map(t => `(${t})+`).join(' ')}</span> ` : '';
    return prefix + shown.map(t => `(${C.fmtAffine(t.W, t.w)})`).join(' ') + (n > shown.length ? ` … ${n - shown.length} more` : '');
  }

  function renderTourWyckoff() {
    const slides = classes.filter(c => hasSlide(c.e)), still = classes.filter(c => !hasSlide(c.e));
    return `<h2>Wyckoff positions</h2>
      <p>If the atom lies on a symmetry element that leaves points fixed, the corresponding operation maps it onto itself and some copies coincide. The atom then occupies a <b>special position</b> with fewer copies per cell.</p>
      <p>Each set of equivalent positions is labelled by its <b>multiplicity</b> (copies per cell) and a <b>Wyckoff letter</b>, from <i>a</i> for the most special up to the general position. The <b>site symmetry</b> lists the operations that leave the point fixed. Select a row to move the atom there.</p>
      <div class="scroll-x"><table class="tbl wyck"><thead><tr><th>Mult.</th><th>Letter</th><th>Site symmetry</th><th>Coordinates</th></tr></thead><tbody>${wyckRows()}</tbody></table></div>
      ${slides.length && still.length ? `<p class="note">Only ${still.map(c => `${sym(c.e)}`).join(', ')} elements can host special positions here. The ${slides.map(c => sym(c.e)).join(', ')} operations include a translation and leave no point fixed.</p>` : ''}
      <p class="note">That is the whole group. The complete tables are <a href="#reference">below the model</a>.</p>`;
  }

  // ======================================================================
  // Scene updates
  // ======================================================================
  function refresh() {
    const c = ctx();
    const orb = state.orb = C.orbit(ops, state.x, A);
    const vis = new Set(c.atoms());
    const labelled = i => i === 0 || i === state.flash || (!big && (c.labels || state.mode === 'tour'));
    ops.forEach((o, i) => {
      const m = copies[i];
      view.poseMotif(m, mv(A, orb.images[i]), o.e.Wc);
      m.visible = vis.has(i);
      const shown = orb.clusters.find(cl => cl.includes(i)).filter(j => vis.has(j));
      const lead = shown[0] === i;
      m.userData.body.visible = lead;
      m.userData.halo.visible = lead && (shown.length > 1 || shown.includes(state.flash));
      const L = m.userData.label;
      L.show = m.visible && lead && shown.some(labelled);
      L.d.textContent = shown.map(j => j + 1).join(' = ');
      L.d.classList.toggle('merged', shown.length > 1);
    });

    elements.forEach(el => {
      setElementVisible(el, c.solo ? el.key === c.solo
        : (c.elems && !state.hidden.has(el.key)) || (c.cls && state.showClass && el.key === c.cls.key));
    });
    Object.entries(focusCache).forEach(([i, f]) => { if (f) f.obj.visible = f.lbl.show = false; });
    if (c.list && state.sel != null) {
      const f = focusFor(state.sel);
      if (f) f.obj.visible = f.lbl.show = true;
    }
    document.querySelectorAll('#step tr[data-act="pick"]').forEach(tr => tr.classList.toggle('sel', +tr.dataset.i === state.sel));
    renderLegend(c, vis.size > 0);
    renderStatus(c);
    renderLive();
  }

  function renderLegend(c, atoms) {
    const parts = [];
    if (atoms) {
      parts.push('<span><i class="sw r"></i>original handedness</span>');
      if (anyImproper) parts.push('<span><i class="sw l"></i>mirror image</span>');
    }
    const seen = new Map();
    elements.forEach(el => { if (el.obj && el.obj.visible) seen.set(el.key, el.e); });
    if (c.list && state.sel != null && ops[state.sel].e.kind !== 'translation') seen.set(C.symText(ops[state.sel].e), ops[state.sel].e);
    seen.forEach(e => parts.push(`<span>${swatch(e)}<em>${sym(e)} ${C.nameOf(e).toLowerCase()}</em></span>`));
    $('#legend').innerHTML = parts.join('');
  }

  function renderStatus(c) {
    $('#atomPanel').hidden = !c.sliders;
    if (!c.sliders) return;
    const orb = state.orb, n = ops.length, wy = C.matchWyckoff(D.wyckoff, state.x), box = $('#status');
    box.className = 'status';
    if (orb.clusters.length === n) {
      box.innerHTML = `<b>${n}</b> distinct copies per cell: general position <b>${wy.m}<i>${wy.l}</i></b>.` +
        (orb.minSep < 0.9 ? ` Two copies are ${orb.minSep.toFixed(2)} Å apart; a special position is close.` : '');
    } else {
      box.classList.add('special');
      const merged = orb.clusters.filter(cl => cl.length > 1);
      const how = orb.clusters.length === 1 ? ` (all ${n} coincide)`
        : merged.length <= 4 && merged.every(cl => cl.length <= 4) ? ` (${merged.map(cl => cl.map(j => j + 1).join('=')).join(', ')} coincide)`
          : ` (they coincide in groups of ${n / orb.clusters.length})`;
      box.innerHTML = `<b>${orb.clusters.length}</b> distinct ${orb.clusters.length === 1 ? 'copy' : 'copies'} instead of ${n}${how}. ` +
        `Special position <b>${wy.m}<i>${wy.l}</i></b>, site symmetry <b>${siteHTML(wy.site)}</b>.`;
    }
    document.querySelectorAll('#step tr[data-act="wyck"]').forEach(tr => tr.classList.toggle('sel', tr.dataset.l === wy.l));
  }

  function renderLive() {
    const fx = p => `(${p.map(C.fmtNum).join(', ')})`;
    const f = $('#formula');
    if (!f) return;
    if (state.sel == null) { f.innerHTML = ''; return; }
    const o = ops[state.sel], raw = add(mv(o.W, state.x), o.w), w = C.wrapv(raw);
    const moved = raw.some((v, k) => Math.abs(v - w[k]) > 1e-6);
    f.innerHTML = `<div><span class="m">${NUM(state.sel)}&ensp;(x, y, z) → (${C.fmtAffine(o.W, o.w)})</span></div>
      <div class="num">${fx(state.x)} → ${fx(raw)}${moved ? ` ≡ ${fx(w)}` : ''}</div>
      ${moved ? '<div class="hint">Coordinates outside 0–1 lie in a neighbouring cell; adding whole lattice vectors gives the equivalent position in this cell.</div>' : ''}`;
  }

  // Animate operation i on atom 1. In the tour its copy appears when the motion ends;
  // elsewhere every copy is already there, so the target copy is highlighted instead.
  function play(i) {
    state.sel = i;
    refresh();
    const inTour = state.mode === 'tour';
    if (inTour) copies[i].visible = false;
    view.playOp(ops[i].e, state.x, {
      title: `${NUM(i)} ${C.symText(ops[i].e)}`,
      onDone: () => { state.played.add(i); if (inTour) refresh(); else flash(i); }
    });
  }

  function playPair(r, c) {
    const st0 = { pos: mv(A, state.x), L: C.math.I3() };
    const s1 = view.opSegments(ops[r].e, st0, `${NUM(r)} `);
    const st1 = view.endOf(s1, st0);
    const segs = [view.hold(300, `First ${NUM(r)}`, st0), ...s1, view.hold(500, `then ${NUM(c)}`, st1), ...view.opSegments(ops[c].e, st1, `${NUM(c)} `)];
    const w = view.wrapSegment(view.endOf(segs, st0));
    if (w) segs.push(w);
    view.run(segs, () => flash(C.compose(ops, r, c).index));
    $('#pairResult').innerHTML = describePair(r, c);
  }

  // ======================================================================
  // Wiring
  // ======================================================================
  function setX(x) {
    state.x = x.map(v => (Math.round(v * 100) / 100) % 1);
    document.querySelectorAll('.sliders input').forEach(inp => {
      inp.value = state.x[+inp.dataset.c];
      inp.nextElementSibling.textContent = (+inp.value).toFixed(2);
    });
    view.cancel();
    refresh();
  }

  function init() {
    document.querySelectorAll('.sliders input').forEach(inp => inp.addEventListener('input', () => {
      const x = state.x.slice();
      x[+inp.dataset.c] = +inp.value;
      setX(x);
    }));
    $('.tabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) setTab(b.dataset.tab); });
    $('#tourBtn').addEventListener('click', () => goTour(0));
    $('#tourExit').addEventListener('click', () => setTab(state.tab));
    $('#tourDots').addEventListener('click', e => { const b = e.target.closest('button'); if (b) goTour(+b.dataset.k); });
    $('#prev').addEventListener('click', () => goTour(state.step - 1));
    $('#next').addEventListener('click', () => (state.step < tour.length - 1 ? goTour(state.step + 1) : setTab('symmetry')));
    document.addEventListener('keydown', e => {
      if (state.mode !== 'tour' || e.target.matches('input, select, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'ArrowRight') goTour(state.step + 1);
      if (e.key === 'ArrowLeft') goTour(state.step - 1);
      if (e.key === 'Escape') setTab(state.tab);
    });

    const body = $('#step');
    body.addEventListener('click', e => {
      const t = e.target.closest('[data-act]');
      if (!t) return;
      clearTimeout(state.timer);
      switch (t.dataset.act) {
        case 'pick': play(+t.dataset.i); break;
        case 'place': setX(C.wrapv(ops[state.sel].e.pf)); play(state.sel); break;
        case 'openkind':
          state.openKind = state.openKind === t.dataset.key ? null : t.dataset.key;
          state.sel = null;
          view.cancel();
          renderPanel();
          break;
        case 'playkind': playKind(t.dataset.key); break;
        case 'pair':
          body.querySelectorAll('.cayley button').forEach(b => b.classList.toggle('on', b === t));
          playPair(+t.dataset.r, +t.dataset.c);
          break;
        case 'pairpick': playPair(+$('#pA').value, +$('#pB').value); break;
        case 'wyck': {
          const w = D.wyckoff.find(v => v.l === t.dataset.l);
          setX(w === D.wyckoff[0] ? pickStart() : placeOn(w));
          break;
        }
      }
    });
    body.addEventListener('change', e => {
      const t = e.target;
      if (t.dataset.act === 'showclass') state.showClass = t.checked;
      if (t.dataset.act === 'kind') {
        state.touchedKinds = true;
        if (t.checked) state.hidden.delete(t.value); else state.hidden.add(t.value);
      }
      refresh();
    });

    setX(state.x);
    // #tour-<step> opens the tour (older #<step> links too); #wyckoff, #operations, #symbol open a tab.
    const h = location.hash.slice(1);
    const k = tour.findIndex(s => h === 'tour-' + s.key || h === s.key);
    if (k >= 0) goTour(k);
    else if (h === 'tour') goTour(0);
    else setTab(TABS[h] ? h : h === 'overview' ? 'symbol' : 'symmetry', true);
  }

  init();
})();
