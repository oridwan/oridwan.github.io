/* ==========================================================================
   Space-group page: a guided walk through one group's symmetry operations,
   symmetry elements and Wyckoff positions. Group data is embedded in the page
   (#sg-data) by scripts/build_symmetry.py.
   ========================================================================== */
(function () {
  'use strict';

  const C = window.SGCore;
  const { mv, add, inv, det } = C.math;
  const $ = s => document.querySelector(s);
  const NUM = i => `(${i + 1})`;
  const sym = C.symHTML;
  const siteHTML = s => s.replace(/-(\d)/g, (m, d) => C.bar(d));

  const D = JSON.parse($('#sg-data').textContent);
  if (!window.THREE) {
    $('#step').innerHTML = '<h2>3D view unavailable</h2><p>The three.js library did not load. Check the connection and reload.</p>';
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
  const big = ops.length > 24;

  // Coset representatives grouped by the kind of symmetry element (2, 2₁, m, c, -1, ...).
  const classes = [];
  for (let i = 1; i < nRep; i++) {
    const e = ops[i].e, key = C.symText(e);
    let c = classes.find(x => x.key === key);
    if (!c) classes.push(c = { key, e, ops: [] });
    c.ops.push(i);
  }
  const hasSlide = e => e.kind === 'translation' || (e.kind === 'rotation' && e.screw > 0) || (e.kind === 'mirror' && e.glide !== 'm');

  const symbolHTML = C.hmHTML(D.short);
  const fullHTML = C.hmHTML(D.full);

  // ---------- viewer ----------
  const view = SGView.create($('#viewer'));
  view.setLattice(A);
  view.motifScale = Math.max(0.35, Math.min(1, 0.5 * Math.cbrt(Math.abs(det(A)) / ops.length)));

  const copies = ops.map((o, i) => {
    const m = view.makeMotif();
    view.root.add(m);
    m.userData.label = view.addLabel('', String(i + 1), () => m.position);
    return m;
  });
  const elemRoot = new THREE.Group();
  view.root.add(elemRoot);
  let elements = null;               // built on first use; large groups have hundreds
  function ensureElements() {
    if (elements) return elements;
    elements = C.enumerateElements(ops, A, Ainv);
    elements.forEach(el => { el.key = C.symText(el.e); });
    return elements;
  }
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
  const state = { x: pickStart(), step: 0, played: new Set(), sel: null, showClass: false, hidden: new Set(), orb: null, timer: 0 };

  function pickStart() {
    // the candidate whose copies stay farthest apart
    let best = null, sep = -1;
    for (const x of [[0.19, 0.11, 0.31], [0.13, 0.27, 0.38], [0.31, 0.07, 0.17], [0.09, 0.22, 0.41], [0.36, 0.14, 0.03], [0.07, 0.17, 0.29]]) {
      const o = C.orbit(ops, x, A);
      if (o.clusters.length === ops.length && o.minSep > sep) { best = x; sep = o.minSep; }
    }
    return best || [0.19, 0.11, 0.31];
  }

  // ======================================================================
  // Steps
  // ======================================================================
  const steps = [
    { key: 'overview', title: 'Overview', atoms: () => [], render: renderOverview },
    { key: 'motif', title: 'A general point', atoms: () => [0], sliders: true, render: renderMotif },
    ...(centOps.length ? [{ key: 'centring', title: 'Lattice centring', atoms: () => [0, ...centOps.filter(i => state.played.has(i))], sliders: true, list: centOps, render: renderCentring }] : []),
    ...classes.map((c, k) => ({
      key: 'el-' + c.key.replace(/[^a-z0-9]/gi, m => ({ '-': 'bar', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5' })[m] || ''),
      title: `${sym(c.e)} ${plural(C.nameOf(c.e))}`, cls: c, list: c.ops, sliders: true,
      atoms: () => [0, ...classes.slice(0, k).flatMap(x => x.ops), ...c.ops.filter(i => state.played.has(i))],
      render: () => renderClass(c)
    })),
    { key: 'general-position', title: 'The general position', atoms: () => all, elems: true, sliders: true, render: renderTogether },
    { key: 'products', title: 'Combining operations', atoms: () => all, sliders: true, render: renderCombine },
    { key: 'wyckoff', title: 'Wyckoff positions', atoms: () => all, elems: true, sliders: true, render: renderWyckoff }
  ];
  function plural(name) { return name.replace(/(axis)$/, 'axes').replace(/(plane|centre|translation)$/, '$1s'); }

  // keepHash: leave a non-step anchor such as #reference in the address bar.
  function go(k, keepHash = false) {
    k = Math.max(0, Math.min(steps.length - 1, k));
    view.cancel();
    view.trailReset();
    clearTimeout(state.timer);
    state.step = k;
    state.showClass = false;
    const s = steps[k];
    state.sel = s.list ? s.list[0] : null;
    $('#step').innerHTML = s.render();
    if (!keepHash) history.replaceState(null, '', '#' + s.key);
    $('#steps').querySelectorAll('li').forEach((li, j) => li.classList.toggle('on', j === k));
    const prev = steps[k - 1], next = steps[k + 1];
    $('#prev').innerHTML = prev ? `<span>Previous</span>${prev.title}` : '';
    $('#next').innerHTML = next ? `<span>Next</span>${next.title}` : '';
    $('#prev').hidden = !prev;
    $('#next').hidden = !next;
    refresh();
    if (s.list && !state.played.has(state.sel)) state.timer = setTimeout(() => play(state.sel), 700);
  }

  // ---------- step content ----------
  function renderOverview() {
    const dec = C.decodeHM(D.full, SYS);
    const rows = [`<tr><td class="m">${dec.letter}</td><td>Lattice</td><td>${dec.letterWords}</td></tr>`]
      .concat(dec.positions.map(p => `<tr class="${p.token === '1' ? 'muted' : ''}"><td class="m">${p.html}</td><td>${p.dir}</td><td>${p.words}</td></tr>`));
    const yes = b => (b ? 'yes' : 'no');
    return `<h2>Overview</h2>
      <p>Space group ${symbolHTML} (No. ${D.number}) belongs to the ${SYS} crystal system and to the crystal class (point group) <span class="m">${C.hmHTML(D.pointGroup)}</span>.
      A general point has <b>${ops.length}</b> symmetry-equivalent positions in each unit cell${nc > 1 ? ` (${nRep} for each of the ${nc} lattice points of the centred cell)` : ''}.</p>
      ${D.example ? `<p>Examples: ${D.example}.</p>` : ''}
      <h3>Reading the symbol</h3>
      <p>The full Hermann–Mauguin symbol <span class="m">${fullHTML}</span> gives the lattice type, then one entry for each symmetry direction of the ${SYS} system.</p>
      <table class="tbl decode"><thead><tr><th>Entry</th><th>Direction</th><th>Meaning</th></tr></thead><tbody>${rows.join('')}</tbody></table>
      <h3>Properties</h3>
      <dl class="facts">
        <dt>Centrosymmetric</dt><dd>${yes(D.centrosymmetric)}</dd>
        <dt>Sohncke group</dt><dd>${yes(D.sohncke)}${D.sohncke ? ', contains only rotations and screw rotations, so it can hold a single enantiomer of a chiral molecule' : ''}</dd>
        <dt>Polar</dt><dd>${yes(D.polar)}</dd>
        <dt>Setting</dt><dd>${settingWords()}</dd>
      </dl>
      <p class="note">The following steps build the group one kind of symmetry element at a time. Drag the model to rotate it; the buttons in its corner look along a, b or c.</p>`;
  }
  function settingWords() {
    const s = ['standard setting of the International Tables, Vol. A'];
    if (SYS === 'monoclinic') s.push('unique axis b, cell choice 1');
    if (D.choice === '2') s.push('origin choice 2 (origin at a centre of inversion)');
    if (D.choice === 'H') s.push('hexagonal axes');
    return s.join('; ');
  }

  function renderMotif() {
    return `<h2>A general point</h2>
      <p>Symmetry is easiest to see by following a single point. The model shows one atom at fractional coordinates <i>(x, y, z)</i>. Each coordinate is a fraction of the corresponding cell edge, so <i>x</i> = 0.5 lies halfway along <i>a</i>. The sliders below the model move it.</p>
      <p>A sphere looks the same after any rotation, so the atom carries three arms of different length that act as a <b>handedness marker</b>. You can read it as the atom's local environment.</p>
      <dl class="facts">
        <dt><i class="sw r"></i> Blue</dt><dd>same handedness as the starting atom</dd>
        <dt><i class="sw l"></i> Orange</dt><dd>mirror image (opposite handedness)</dd>
      </dl>
      <p>Every symmetry operation of the group must map this atom onto an atom of the same kind. The ${ops.length} positions generated this way form the general position, built up in the next steps.</p>`;
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

  function renderClass(c) {
    const e = c.e, name = C.nameOf(e).toLowerCase();
    const hand = e.det < 0
      ? '<p class="note"><b>Handedness.</b> This operation produces a mirror image, so the new copy is orange. Operations of this kind cannot occur in a crystal made of a single enantiomer of a chiral molecule.</p>'
      : '<p class="note"><b>Handedness.</b> Rotations and screw rotations preserve handedness, so the copy stays blue.</p>';
    const fixed = hasSlide(e)
      ? '<p class="note"><b>Fixed points.</b> Because of its translation part, this operation leaves no point in place. An atom can therefore never sit on a screw axis or glide plane as a special position.</p>'
      : `<p class="note"><b>Fixed points.</b> Points on the element are mapped onto themselves, so an atom placed there coincides with its own image. <button type="button" class="link" data-act="place">Move the atom onto the element</button></p>`;
    return `<h2>${sym(e)} ${plural(C.nameOf(e))}</h2>
      <p>${whatItDoes(e)}</p>
      <p>${c.ops.length === 1 ? 'One operation' : `${c.ops.length} operations`} of this kind ${c.ops.length === 1 ? 'is' : 'are'} listed for ${symbolHTML}. Select a row to play it on the atom.</p>
      ${opRows(c.ops)}
      <div class="formula" id="formula"></div>
      <label class="check"><input type="checkbox" data-act="showclass"> Show every ${name} in the unit cell</label>
      ${hand}${fixed}`;
  }

  function elementCounts() {
    const m = new Map();
    ensureElements().forEach(el => {
      if (!m.has(el.key)) m.set(el.key, { e: el.e, n: 0 });
      m.get(el.key).n++;
    });
    return [...m.entries()];
  }

  function renderTogether() {
    const gen = D.wyckoff[0];
    const counts = elementCounts();
    const rows = (big ? all.slice(0, nRep) : all).map(i =>
      `<tr><td>${NUM(i)}</td><td class="m">${C.fmtAffine(ops[i].W, ops[i].w)}</td><td class="m">${sym(ops[i].e)}</td><td class="live-cell" data-live="${i}"></td></tr>`).join('');
    return `<h2>The general position</h2>
      <p>Applying all ${ops.length} operations to the atom gives ${ops.length} copies per unit cell, the <b>general position</b> ${gen.m}<i>${gen.l}</i>. It is called general because <i>x</i>, <i>y</i> and <i>z</i> are free; its site symmetry is 1.</p>
      <table class="tbl ops"><thead><tr><th></th><th>Coordinates</th><th>Element</th><th>This atom</th></tr></thead><tbody>${rows}</tbody></table>
      ${big ? `<p class="note">Only the first ${nRep} operations are listed; the others add the centring vectors.</p>` : ''}
      <h3>Symmetry elements in the unit cell</h3>
      <p>The lattice repeats the symmetry elements as well. Counting those on faces, edges and corners, which neighbouring cells share, the cell contains:</p>
      <div class="checks">${counts.map(([k, c]) =>
        `<label class="check"><input type="checkbox" data-act="kind" value="${k}" ${state.hidden.has(k) ? '' : 'checked'}> ${c.n} × ${sym(c.e)} ${C.nameOf(c.e).toLowerCase()}</label>`).join('')}</div>
      <p class="note">Viewed along a symmetry direction, this is the arrangement drawn in the space-group diagrams of the International Tables. Try the <i>along ${UP}</i> button.</p>`;
  }

  function renderCombine() {
    const intro = `<h2>Combining operations</h2>
      <p>Performing one operation and then another is again an operation of the group, up to a lattice translation. The set is closed under composition, which is what makes it a <b>group</b>, and it is why the symbol only needs to name a few generators.</p>`;
    if (ops.length <= 8) {
      const head = ops.map((o, i) => `<th>${NUM(i)} ${sym(o.e)}</th>`).join('');
      const rows = ops.map((o, r) => `<tr><th>${NUM(r)} ${sym(o.e)}</th>${ops.map((p, c) => {
        const k = C.compose(ops, r, c).index;
        return `<td><button type="button" data-act="pair" data-r="${r}" data-c="${c}">${sym(ops[k].e)}<small>${NUM(k)}</small></button></td>`;
      }).join('')}</tr>`).join('');
      return `${intro}<p>Rows give the first operation, columns the second. Select a cell to watch both applied in turn.</p>
        <div class="scroll-x"><table class="cayley"><thead><tr><th>first \\ then</th>${head}</tr></thead><tbody>${rows}</tbody></table></div>
        <p class="result" id="pairResult"></p>`;
    }
    const opt = sel => ops.map((o, i) => `<option value="${i}" ${i === sel ? 'selected' : ''}>${NUM(i)} ${C.symText(o.e)} · ${C.fmtAffine(o.W, o.w)}</option>`).join('');
    return `${intro}<p>The group has ${ops.length} operations, too many for a full multiplication table. Choose two:</p>
      <div class="pair-pick"><label>First <select id="pA">${opt(1)}</select></label><label>then <select id="pB">${opt(Math.min(2, ops.length - 1))}</select></label>
      <button type="button" class="btn-plain" data-act="pairpick">Apply both</button></div>
      <p class="result" id="pairResult"></p>`;
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

  function renderWyckoff() {
    const slides = classes.filter(c => hasSlide(c.e)), still = classes.filter(c => !hasSlide(c.e));
    const rows = D.wyckoff.map(w => `<tr data-act="wyck" data-l="${w.l}"><td class="m">${w.m}</td><td class="m"><i>${w.l}</i></td><td class="m">${siteHTML(w.site)}</td><td class="m coords">${wyckCoords(w)}</td></tr>`).join('');
    return `<h2>Wyckoff positions</h2>
      <p>If the atom lies on a symmetry element that leaves points fixed, the corresponding operation maps it onto itself and some copies coincide. The atom then occupies a <b>special position</b> with fewer copies per cell.</p>
      <p>Each set of equivalent positions is labelled by its <b>multiplicity</b> (copies per cell) and a <b>Wyckoff letter</b>, from <i>a</i> for the most special up to the general position. The <b>site symmetry</b> lists the operations that leave the point fixed. In its oriented form, each character refers to one symmetry direction of the full symbol, and a dot marks a direction with no symmetry at the site. Select a row to move the atom there.</p>
      <div class="scroll-x"><table class="tbl wyck"><thead><tr><th>Mult.</th><th>Letter</th><th>Site symmetry</th><th>Coordinates</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="note">The complete tables, with every coordinate triplet, are <a href="#reference">below the viewer</a>.</p>
      ${slides.length && still.length ? `<p class="note">Only ${still.map(c => `${sym(c.e)}`).join(', ')} elements can host special positions here. The ${slides.map(c => sym(c.e)).join(', ')} operations include a translation and leave no point fixed.</p>` : ''}`;
  }

  // ======================================================================
  // Scene updates
  // ======================================================================
  function refresh() {
    const s = steps[state.step];
    const orb = state.orb = C.orbit(ops, state.x, A);
    const vis = new Set(s.atoms());
    ops.forEach((o, i) => {
      const m = copies[i];
      view.poseMotif(m, mv(A, orb.images[i]), o.e.Wc);
      m.visible = vis.has(i);
      const shown = orb.clusters.find(c => c.includes(i)).filter(j => vis.has(j));
      const lead = shown[0] === i;
      m.userData.body.visible = lead;
      m.userData.halo.visible = lead && shown.length > 1;
      const L = m.userData.label;
      L.show = !big && m.visible && lead;
      L.d.textContent = shown.map(j => j + 1).join(' = ');
      L.d.classList.toggle('merged', shown.length > 1);
    });

    if (elements) elements.forEach(el => {
      setElementVisible(el, (s.elems && !state.hidden.has(el.key)) || (s.cls && state.showClass && el.key === s.cls.key));
    });
    Object.entries(focusCache).forEach(([i, f]) => {
      if (!f) return;
      f.obj.visible = f.lbl.show = s.list != null && +i === state.sel;
    });
    if (s.list != null && state.sel != null) {
      const f = focusFor(state.sel);
      if (f) f.obj.visible = f.lbl.show = true;
    }
    document.querySelectorAll('#step tr[data-act="pick"]').forEach(tr => tr.classList.toggle('sel', +tr.dataset.i === state.sel));
    renderLegend(s, vis.size > 0);
    renderStatus(s);
    renderLive(s);
  }

  function renderLegend(s, atoms) {
    const parts = [];
    if (atoms) {
      parts.push('<span><i class="sw r"></i>original handedness</span>');
      if (ops.some(o => o.e.det < 0)) parts.push('<span><i class="sw l"></i>mirror image</span>');
    }
    const seen = new Map();
    if (s.elems && elements) elements.forEach(el => { if (!state.hidden.has(el.key)) seen.set(el.key, el.e); });
    if (s.list != null && state.sel != null && ops[state.sel].e.kind !== 'translation') seen.set('sel', ops[state.sel].e);
    seen.forEach(e => {
      const sw = e.kind === 'mirror' ? `<i class="sw plane ${e.glide !== 'm' ? 'glide' : ''}"></i>`
        : e.kind === 'rotation' ? `<i class="sw axis ${e.screw ? 'screw' : ''}"></i>` : '<i class="sw inv"></i>';
      parts.push(`<span>${sw}<em>${sym(e)} ${C.nameOf(e).toLowerCase()}</em></span>`);
    });
    $('#legend').innerHTML = parts.join('');
  }

  function renderStatus(s) {
    $('#atomPanel').hidden = !s.sliders;
    if (!s.sliders) return;
    const orb = state.orb, n = ops.length, wy = C.matchWyckoff(D.wyckoff, state.x), box = $('#status');
    box.className = 'status';
    if (orb.clusters.length === n) {
      box.innerHTML = `<b>${n}</b> distinct copies per cell: general position <b>${wy.m}<i>${wy.l}</i></b>.` +
        (orb.minSep < 0.9 ? ` Two copies are ${orb.minSep.toFixed(2)} Å apart; a special position is close.` : '');
    } else {
      box.classList.add('special');
      const merged = orb.clusters.filter(c => c.length > 1);
      box.innerHTML = `<b>${orb.clusters.length}</b> distinct copies instead of ${n}${merged.length <= 4 ? ` (${merged.map(c => c.map(j => j + 1).join('=')).join(', ')} coincide)` : ''}. ` +
        `Special position <b>${wy.m}<i>${wy.l}</i></b>, site symmetry <b>${siteHTML(wy.site)}</b>.`;
    }
    document.querySelectorAll('#step tr[data-act="wyck"]').forEach(tr => tr.classList.toggle('sel', tr.dataset.l === wy.l));
  }

  function renderLive(s) {
    const fx = p => `(${p.map(C.fmtNum).join(', ')})`;
    document.querySelectorAll('#step [data-live]').forEach(el => {
      const o = ops[+el.dataset.live];
      el.textContent = fx(C.wrapv(add(mv(o.W, state.x), o.w)));
    });
    const f = $('#formula');
    if (f && state.sel != null) {
      const o = ops[state.sel], raw = add(mv(o.W, state.x), o.w), w = C.wrapv(raw);
      const moved = raw.some((v, k) => Math.abs(v - w[k]) > 1e-6);
      f.innerHTML = `<div><span class="m">${NUM(state.sel)}&ensp;(x, y, z) → (${C.fmtAffine(o.W, o.w)})</span></div>
        <div class="num">${fx(state.x)} → ${fx(raw)}${moved ? ` ≡ ${fx(w)}` : ''}</div>
        ${moved ? '<div class="hint">Coordinates outside 0–1 lie in a neighbouring cell; adding whole lattice vectors gives the equivalent position in this cell.</div>' : ''}`;
    }
  }

  function play(i) {
    state.sel = i;
    refresh();
    copies[i].visible = false;
    view.playOp(ops[i].e, state.x, {
      title: `${NUM(i)} ${C.symText(ops[i].e)}`,
      onDone: () => { state.played.add(i); refresh(); }
    });
  }

  function playPair(r, c) {
    const st0 = { pos: mv(A, state.x), L: C.math.I3() };
    const s1 = view.opSegments(ops[r].e, st0, `${NUM(r)} `);
    const st1 = view.endOf(s1, st0);
    const segs = [view.hold(300, `First ${NUM(r)}`, st0), ...s1, view.hold(500, `then ${NUM(c)}`, st1), ...view.opSegments(ops[c].e, st1, `${NUM(c)} `)];
    const w = view.wrapSegment(view.endOf(segs, st0));
    if (w) segs.push(w);
    view.run(segs, () => {
      view.caption(`Result: copy ${NUM(C.compose(ops, r, c).index)}`);
      setTimeout(() => { if (!view.anim) view.caption(''); }, 1600);
    });
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
    $('#steps').innerHTML = steps.map((s, k) => `<li><button type="button" data-k="${k}"><span>${s.title}</span></button></li>`).join('');
    // Large groups start with only the first kind of element switched on.
    if (big) ensureElements().forEach(el => { if (classes[0] && el.key !== classes[0].key) state.hidden.add(el.key); });

    document.querySelectorAll('.sliders input').forEach(inp => inp.addEventListener('input', () => {
      const x = state.x.slice();
      x[+inp.dataset.c] = +inp.value;
      setX(x);
    }));
    $('#steps').addEventListener('click', e => { const b = e.target.closest('button'); if (b) go(+b.dataset.k); });
    $('#prev').addEventListener('click', () => go(state.step - 1));
    $('#next').addEventListener('click', () => go(state.step + 1));
    document.addEventListener('keydown', e => {
      if (e.target.matches('input, select, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'ArrowRight') go(state.step + 1);
      if (e.key === 'ArrowLeft') go(state.step - 1);
    });

    const stepEl = $('#step');
    stepEl.addEventListener('click', e => {
      const t = e.target.closest('[data-act]');
      if (!t) return;
      clearTimeout(state.timer);
      switch (t.dataset.act) {
        case 'pick': play(+t.dataset.i); break;
        case 'place': setX(C.wrapv(ops[state.sel].e.pf)); play(state.sel); break;
        case 'pair':
          stepEl.querySelectorAll('.cayley button').forEach(b => b.classList.toggle('on', b === t));
          playPair(+t.dataset.r, +t.dataset.c);
          break;
        case 'pairpick': playPair(+$('#pA').value, +$('#pB').value); break;
        case 'wyck': {
          const w = D.wyckoff.find(v => v.l === t.dataset.l), first = w.parsed[0];
          setX(w === D.wyckoff[0] ? pickStart() : C.wrapv(add(mv(first.W, state.x), first.w)));
          break;
        }
      }
    });
    stepEl.addEventListener('change', e => {
      const t = e.target;
      if (t.dataset.act === 'showclass') { state.showClass = t.checked; if (t.checked) ensureElements(); }
      if (t.dataset.act === 'kind') { if (t.checked) state.hidden.delete(t.value); else state.hidden.add(t.value); }
      refresh();
    });

    setX(state.x);
    const k = steps.findIndex(s => '#' + s.key === location.hash);
    go(k < 0 ? 0 : k, k < 0);
  }

  init();
})();
