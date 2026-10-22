/* ==========================================================================
   Shared three.js viewer: unit cell, chiral "hand" motif, symmetry-element
   drawings and animated symmetry operations. Used by the group pages and by
   the figures on the guide page. Needs three.js r128 + OrbitControls + SGCore.
   ========================================================================== */
(function () {
  'use strict';

  const C = window.SGCore;
  const { I3, mm, mv, add, sub, scl, dot, cross, norm, madd, mscl, det, inv, rodrigues, outer } = C.math;
  const v3 = a => new THREE.Vector3(a[0], a[1], a[2]);
  const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  const COL = {
    cell: 0xa3abba, a: 0xb8434f, b: 0x3d8a5a, c: 0x2f62b0,
    right: 0x1d4f91, rightTip: 0x8aa9d6, left: 0xc8651f, leftTip: 0xeab48a, stick: 0x8a93a3,
    axis: 0x0e7c7b, plane: 0x7a55c7, halo: 0xe9c46a, point: 0x9aa3b5
  };
  const AXIS_CSS = { a: '#b8434f', b: '#3d8a5a', c: '#2f62b0' };

  let geoSphere;
  const mat = (color, extra) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.5, metalness: 0 }, extra));
  function ball(r, color, extra) {
    geoSphere = geoSphere || new THREE.SphereGeometry(1, 28, 18);
    const m = new THREE.Mesh(geoSphere, mat(color, extra));
    m.scale.setScalar(r);
    return m;
  }
  function cylinder(r, color, extra) {
    const g = new THREE.CylinderGeometry(r, r, 1, 14, 1);
    g.translate(0, 0.5, 0);
    return new THREE.Mesh(g, mat(color, extra));
  }
  function placeCyl(mesh, from, to) {
    const d = to.clone().sub(from), L = d.length();
    mesh.visible = L > 1e-4;
    if (!mesh.visible) return;
    mesh.position.copy(from);
    mesh.scale.set(1, L, 1);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  }

  // The "hand": a ball with three fingers of different length, so it is chiral.
  const FINGERS = [{ d: [0.66, 0.1, 0.1], r: 0.12 }, { d: [-0.1, 0.52, 0.16], r: 0.095 }, { d: [0.06, -0.08, 0.42], r: 0.07 }];

  function create(container, opts = {}) {
    const V = { container, labels: [], A: null, Ainv: null, anim: null, tween: null, live: true, motifScale: 1 };

    // ---------- DOM ----------
    container.classList.add('viewer');
    const labelsEl = document.createElement('div');
    labelsEl.className = 'labels';
    labelsEl.setAttribute('aria-hidden', 'true');
    const captionEl = document.createElement('div');
    captionEl.className = 'caption';
    captionEl.setAttribute('aria-live', 'polite');
    container.append(labelsEl, captionEl);

    if (opts.viewButtons !== false) {
      const bar = document.createElement('div');
      bar.className = 'view-btns';
      bar.innerHTML = ['iso:3D', 'a:a', 'b:b', 'c:c'].map(s => {
        const [k, t] = s.split(':');
        return `<button type="button" data-view="${k}" title="${k === 'iso' ? 'Perspective view' : 'Look along ' + k}">${k === 'iso' ? t : 'along <i>' + t + '</i>'}</button>`;
      }).join('');
      bar.addEventListener('click', e => { const b = e.target.closest('button'); if (b) setView(b.dataset.view); });
      container.append(bar);
      V.viewBar = bar;
    }

    // ---------- three.js ----------
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    container.prepend(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -500, 500);
    scene.add(camera);
    scene.add(new THREE.AmbientLight(0xffffff, 0.64));
    const sun = new THREE.DirectionalLight(0xffffff, 0.52);
    sun.position.set(2, 4, 6);
    camera.add(sun);
    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.enablePan = false;
    renderer.domElement.addEventListener('pointerdown', () => { V.tween = null; markView(null); });
    const cellRoot = new THREE.Group();
    const root = new THREE.Group();     // everything the caller adds; cleared with clear()
    scene.add(cellRoot, root);
    Object.assign(V, { renderer, scene, camera, controls, root });

    const ghost = makeMotif();
    ghost.userData.halo.visible = false;
    ghost.visible = false;
    scene.add(ghost);

    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 2000), 3));
    tg.setDrawRange(0, 0);
    const trail = new THREE.Line(tg, new THREE.LineDashedMaterial({ color: 0x33415a, dashSize: 0.12, gapSize: 0.08 }));
    trail.n = 0;
    scene.add(trail);

    // Only render while on screen.
    new IntersectionObserver(es => { V.live = es[0].isIntersecting; }).observe(container);
    new ResizeObserver(resize).observe(container);

    // ---------- lattice ----------
    function setLattice(A, { axes = true } = {}) {
      V.A = A;
      V.Ainv = inv(A);
      cellRoot.clear();
      V.labels.filter(L => L.cell).forEach(L => L.d.remove());
      V.labels = V.labels.filter(L => !L.cell);
      const corner = (a, b, c) => v3(mv(A, [a, b, c]));
      const edges = [];
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
        edges.push(corner(0, i, j), corner(1, i, j), corner(i, 0, j), corner(i, 1, j), corner(i, j, 0), corner(i, j, 1));
      }
      cellRoot.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(edges),
        new THREE.LineBasicMaterial({ color: COL.cell })));
      if (axes) {
        ['a', 'b', 'c'].forEach((n, i) => {
          const tip = [0, 0, 0]; tip[i] = 1;
          const m = cylinder(0.03, COL[n]);
          placeCyl(m, new THREE.Vector3(), v3(mv(A, tip)));
          cellRoot.add(m);
          const lp = v3(mv(A, tip.map(x => x * 1.08)));
          const L = addLabel('axis', n, () => lp);
          L.d.style.color = AXIS_CSS[n];
          L.cell = true;
        });
        const o = new THREE.Vector3();
        addLabel('axis origin', 'O', () => o).cell = true;
      }
      V.center = v3(mv(A, [0.5, 0.5, 0.5]));
      V.radius = Math.max(...[0, 1].flatMap(a => [0, 1].flatMap(b => [0, 1].map(c => corner(a, b, c).distanceTo(V.center)))));
      controls.target.copy(V.center);
      resize();
      setView(V.viewName || 'iso', false);
    }

    function resize() {
      if (!V.radius) return;
      const w = container.clientWidth, h = container.clientHeight, asp = w / h;
      renderer.setSize(w, h);
      const half = V.radius * (opts.zoom || 1.12) / Math.min(asp, 1);
      Object.assign(camera, { left: -half * asp, right: half * asp, top: half, bottom: -half });
      camera.updateProjectionMatrix();
    }

    function viewDir(name) {
      const col = i => [V.A[0][i], V.A[1][i], V.A[2][i]];
      let d = name === 'iso' ? (opts.iso || [0.85, 0.55, 1.5]) : col('abc'.indexOf(name));
      d = C.math.unit(d);
      if (Math.abs(d[1]) > 0.999) d = C.math.unit([0, d[1], 0.002]);   // OrbitControls can't sit exactly on the pole
      return v3(d);
    }
    function setView(name, animate = true) {
      V.viewName = name;
      const to = viewDir(name);
      if (animate) V.tween = { from: camera.position.clone().sub(V.center).normalize(), to, t0: performance.now() };
      else placeCamera(to);
      markView(name);
    }
    function placeCamera(dir) {
      camera.position.copy(V.center).addScaledVector(dir, 50);
      camera.lookAt(V.center);
    }
    function markView(name) {
      if (V.viewBar) V.viewBar.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.view === name));
    }

    function loop(now) {
      requestAnimationFrame(loop);
      if (!V.live || !V.A) return;
      if (V.tween) {
        const t = Math.min(1, (now - V.tween.t0) / 650);
        placeCamera(V.tween.from.clone().lerp(V.tween.to, ease(t)).normalize());
        if (t >= 1) V.tween = null;
      }
      if (V.anim) stepAnim(now);
      controls.update();
      renderer.render(scene, camera);
      placeLabels();
    }
    requestAnimationFrame(loop);

    // ---------- labels ----------
    function addLabel(cls, html, getPos) {
      const d = document.createElement('div');
      d.className = 'lbl ' + cls;
      d.innerHTML = html;
      labelsEl.appendChild(d);
      const L = { d, getPos, show: true, lift: !/axis|el/.test(cls) };
      V.labels.push(L);
      return L;
    }
    function removeLabel(L) {
      L.d.remove();
      V.labels = V.labels.filter(x => x !== L);
    }
    function placeLabels() {
      const w = container.clientWidth, h = container.clientHeight, p = new THREE.Vector3();
      const lift = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion).multiplyScalar(0.42 * V.motifScale);
      for (const L of V.labels) {
        if (!L.show) { L.d.style.display = 'none'; continue; }
        p.copy(L.getPos());
        if (L.lift) p.add(lift);
        p.project(camera);
        L.d.style.display = '';
        L.d.style.left = ((p.x + 1) / 2 * w) + 'px';
        L.d.style.top = ((1 - p.y) / 2 * h) + 'px';
      }
    }

    // ---------- motif ----------
    function makeMotif() {
      const g = new THREE.Group();
      const body = ball(0.3, COL.right);
      const halo = ball(0.52, COL.halo, { transparent: true, opacity: 0.4, depthWrite: false });
      halo.visible = false;
      g.add(body, halo);
      const fingers = FINGERS.map(f => {
        const s = cylinder(0.04, COL.stick), tip = ball(f.r, COL.rightTip);
        g.add(s, tip);
        return { s, tip, d: f.d };
      });
      g.userData = { body, halo, fingers };
      g.scale.setScalar(V.motifScale);
      return g;
    }
    function poseMotif(m, pos, L) {
      m.position.copy(v3(pos));
      m.scale.setScalar(V.motifScale);
      const o = new THREE.Vector3(), right = det(L) > 0;
      m.userData.fingers.forEach(f => {
        const v = v3(mv(L, f.d));
        placeCyl(f.s, o, v);
        f.tip.position.copy(v);
        f.tip.material.color.setHex(right ? COL.rightTip : COL.leftTip);
      });
      m.userData.body.material.color.setHex(right ? COL.right : COL.left);
    }

    // ---------- symmetry elements ----------
    function sortPoly(pts, n) {
      const c = pts.reduce((s, p) => add(s, p), [0, 0, 0]).map(x => x / pts.length);
      const r0 = sub(pts[0], c);
      const ang = p => { const r = sub(p, c); return Math.atan2(dot(cross(r0, r), n), dot(r0, r)); };
      return pts.slice().sort((p, q) => ang(p) - ang(q));
    }
    function centroid(geom) {
      const A = V.A;
      if (geom.point) return mv(A, geom.point);
      if (geom.line) return mv(A, geom.line[0].map((x, i) => (x + geom.line[1][i]) / 2));
      const s = geom.plane.reduce((t, p) => add(t, p), [0, 0, 0]);
      return mv(A, s.map(x => x / geom.plane.length));
    }

    function elementObject(e, geom, strong) {
      const A = V.A, g = new THREE.Group();
      if (geom.plane) {
        const pts = sortPoly(geom.plane.map(p => mv(A, p)), e.normal);
        const c = pts.reduce((s, p) => add(s, p), [0, 0, 0]).map(x => x / pts.length);
        const tri = [];
        pts.forEach((p, i) => tri.push(...c, ...p, ...pts[(i + 1) % pts.length]));
        const fg = new THREE.BufferGeometry();
        fg.setAttribute('position', new THREE.Float32BufferAttribute(tri, 3));
        const fill = new THREE.Mesh(fg, new THREE.MeshBasicMaterial({
          color: COL.plane, transparent: true, opacity: strong ? 0.2 : 0.1, side: THREE.DoubleSide, depthWrite: false
        }));
        fill.renderOrder = 2;
        const loop = pts.map(v3);
        const edge = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(loop),
          e.glide === 'm' ? new THREE.LineBasicMaterial({ color: COL.plane })
            : new THREE.LineDashedMaterial({ color: COL.plane, dashSize: 0.25, gapSize: 0.15 }));
        if (e.glide !== 'm') edge.computeLineDistances();
        g.add(fill, edge);
        if (e.glide !== 'm' && strong) {
          const gv = v3(mv(A, e.g)), len = gv.length();
          g.add(new THREE.ArrowHelper(gv.normalize(), v3(c), len, COL.plane, 0.4, 0.28));
        }
      }
      if (geom.line) {
        const [p0, p1] = geom.line.map(p => v3(mv(A, p)));
        const r = strong ? 0.05 : 0.035;
        if (e.screw) {           // screw axes are dashed
          const L = p0.distanceTo(p1), dir = p1.clone().sub(p0).normalize();
          for (let s = 0; s < L; s += 0.5) {
            const m = cylinder(r, COL.axis);
            placeCyl(m, p0.clone().addScaledVector(dir, s), p0.clone().addScaledVector(dir, Math.min(L, s + 0.3)));
            g.add(m);
          }
        } else {
          const m = cylinder(r, COL.axis);
          placeCyl(m, p0, p1);
          g.add(m);
        }
      }
      if (geom.point) {
        const p = v3(mv(A, geom.point)), r = strong ? 0.14 : 0.1;
        const w = ball(r, 0xffffff, { emissive: 0x777777 });
        const ring = ball(r * 1.32, 0x0f1b2d, { side: THREE.BackSide });
        w.position.copy(p); ring.position.copy(p);
        g.add(w, ring);
      }
      return g;
    }

    function latticePoints(points, color = COL.point, r = 0.16) {
      const g = new THREE.Group();
      points.forEach(p => { const b = ball(r, color); b.position.copy(v3(mv(V.A, p))); g.add(b); });
      return g;
    }

    // ---------- animated operations ----------
    const seg = (dur, label, fn) => ({ dur, label, fn });
    const hold = (dur, label, st) => seg(dur, label, () => st);
    const endOf = (segs, st) => (segs.length ? segs[segs.length - 1].fn(1) : st);

    // Path segments taking state {pos (Cartesian), L (orientation)} through operation e.
    function opSegments(e, st, tag = '') {
      const x = st.pos, L0 = st.L, out = [];
      const deg = e.N ? Math.round(360 / e.N) + '°' : '';
      switch (e.kind) {
        case 'translation':
          out.push(seg(1000, tag + 'Shift by the centring vector', s => ({ pos: add(x, scl(e.tc, s)), L: L0 })));
          break;
        case 'inversion':
          out.push(seg(1600, tag + 'Through the inversion centre',
            s => ({ pos: add(e.p, scl(sub(x, e.p), 1 - 2 * s)), L: mscl(L0, 1 - 2 * s) })));
          break;
        case 'rotation': {
          const r = sub(x, e.p);
          out.push(seg(2000, tag + (e.screw ? `Rotate ${deg} and translate along the axis` : `Rotate ${deg} about the axis`), s => {
            const R = rodrigues(e.axis, e.theta * s);
            return { pos: add(add(e.p, mv(R, r)), scl(e.tc, s)), L: mm(R, L0) };
          }));
          break;
        }
        case 'mirror': {
          const n = e.normal, h = dot(sub(x, e.p), n);
          const refl = s => madd(I3(), outer(n, n), -2 * s);
          out.push(seg(1400, tag + 'Reflect in the plane', s => ({ pos: sub(x, scl(n, 2 * s * h)), L: mm(refl(s), L0) })));
          if (norm(e.tc) > 1e-6) {
            const xr = sub(x, scl(n, 2 * h)), Lr = mm(refl(1), L0);
            out.push(seg(1200, tag + 'Translate parallel to the plane (glide)', s => ({ pos: add(xr, scl(e.tc, s)), L: Lr })));
          }
          break;
        }
        case 'rotoinversion': {
          const r = sub(x, e.p), R = rodrigues(e.axis, e.theta), y = add(e.p, mv(R, r)), LR = mm(R, L0);
          out.push(seg(1600, tag + `Rotate ${deg}`, s => {
            const Rs = rodrigues(e.axis, e.theta * s);
            return { pos: add(e.p, mv(Rs, r)), L: mm(Rs, L0) };
          }));
          out.push(seg(1400, tag + 'Invert through the point on the axis', s => ({ pos: add(e.p, scl(sub(y, e.p), 1 - 2 * s)), L: mscl(LR, 1 - 2 * s) })));
          break;
        }
      }
      return out;
    }

    // If an operation carried the atom out of the cell, bring it back by a lattice translation.
    function wrapSegment(st) {
      const f = mv(V.Ainv, st.pos), w = C.wrapv(f), shift = sub(w, f).map(Math.round);
      if (shift.every(v => v === 0)) return null;
      const target = mv(V.A, w);
      const words = shift.map((v, i) => (v ? (v > 0 ? '+' : '−') + (Math.abs(v) > 1 ? Math.abs(v) : '') + 'abc'[i] : '')).filter(Boolean).join(' ');
      return seg(1100, `Lattice translation ${words} returns it to this cell`,
        s => ({ pos: add(st.pos, scl(sub(target, st.pos), s)), L: st.L }));
    }

    function run(segs, onDone) {
      cancel();
      trailReset();
      ghost.visible = true;
      V.anim = { segs, k: 0, t0: performance.now(), onDone };
    }
    function cancel() {
      if (!V.anim) return;
      V.anim = null;
      ghost.visible = false;
      caption('');
    }
    function stepAnim(now) {
      const a = V.anim, s = a.segs[a.k];
      const t = Math.min(1, (now - a.t0) / s.dur);
      const st = s.fn(ease(t));
      poseMotif(ghost, st.pos, st.L);
      trailPush(st.pos);
      caption(s.label);
      if (t < 1) return;
      a.k++;
      a.t0 = now;
      if (a.k < a.segs.length) return;
      V.anim = null;
      ghost.visible = false;
      setTimeout(() => { if (!V.anim) caption(''); }, 900);
      if (a.onDone) a.onDone();
    }
    function trailReset() { trail.n = 0; trail.geometry.setDrawRange(0, 0); }
    function trailPush(p) {
      if (trail.n >= 2000) return;
      const a = trail.geometry.attributes.position;
      a.setXYZ(trail.n++, p[0], p[1], p[2]);
      a.needsUpdate = true;
      trail.geometry.setDrawRange(0, trail.n);
      trail.computeLineDistances();
    }
    function caption(text) {
      if (text) captionEl.textContent = text;
      captionEl.classList.toggle('show', !!text);
    }

    // Play operation e on a motif at fractional point x; returns the segments for chaining.
    function playOp(e, x, { tag = '', title = '', onDone } = {}) {
      const st0 = { pos: mv(V.A, x), L: I3() };
      const segs = [hold(350, title, st0), ...opSegments(e, st0, tag)];
      const w = wrapSegment(endOf(segs, st0));
      if (w) segs.push(w);
      run(segs, onDone);
    }

    function clear() {
      cancel();
      trailReset();
      root.clear();
      V.labels.filter(L => !L.cell).forEach(L => L.d.remove());
      V.labels = V.labels.filter(L => L.cell);
    }

    Object.assign(V, {
      setLattice, setView, addLabel, removeLabel, makeMotif, poseMotif, elementObject, centroid, latticePoints,
      opSegments, wrapSegment, run, cancel, caption, playOp, trailReset, clear, seg, hold, endOf
    });
    return V;
  }

  window.SGView = { create, COL, v3 };
})();
