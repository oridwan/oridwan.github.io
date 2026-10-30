/* Figures for Lecture 1 (born-oppenheimer-approximation).
   pes: a one-dimensional potential-energy curve. Drag the atom or use the slider; the force is
   F = −dE/dR, and "Relax" moves downhill with steepest-descent steps until |F| < 0.01 eV/Å,
   the criterion EDIFFG = −0.01 would apply. Both curves are model functions, not DFT data. */

export const MODELS = {
  // Morse form E(R) = De[(1 − e^{−a(R − re)})² − 1]; zero energy = separated atoms
  morse: {
    label: 'Bond (Morse model)', axis: 'Distance R between the atoms (Å)', ticks: 1,
    De: 2.0, a: 1.6, re: 1.5,
    range: [0.95, 4.5], eRange: [-2.4, 2.8], start: 2.8, alpha: 0.05,
    E(R) { const u = Math.exp(-this.a * (R - this.re)); return this.De * ((1 - u) ** 2 - 1); },
    dE(R) { const u = Math.exp(-this.a * (R - this.re)); return 2 * this.De * this.a * u * (1 - u); },
  },
  // E(x) = A((x/b)² − 1)² + c x: two minima of different depth
  double: {
    label: 'Two minima (model)', axis: 'Position x of the atom (Å)', ticks: 0.25,
    A: 0.4, b: 1, c: 0.1,
    range: [-1.75, 1.75], eRange: [-0.3, 1.0], start: 0.35, alpha: 0.15,
    E(x) { const q = (x / this.b) ** 2 - 1; return this.A * q * q + this.c * x; },
    dE(x) { return 4 * this.A * ((x / this.b) ** 2 - 1) * x / this.b ** 2 + this.c; },
  },
};

export const FMAX = 0.01;     // eV/Å, like EDIFFG = -0.01
const MAX_STEP = 0.25;        // Å, cap on one steepest-descent step
const MAX_IONIC = 60;         // like NSW

/** One steepest-descent update R → R + α F, with the step capped. */
export function descend(m, x) {
  const F = -m.dE(x);
  const dx = Math.max(-MAX_STEP, Math.min(MAX_STEP, m.alpha * F));
  return Math.max(m.range[0], Math.min(m.range[1], x + dx));
}

// plot geometry
const W = 640, H = 360, PL = 64, PR = 620, PT = 110, PB = 320;

function scales(m) {
  const [x0, x1] = m.range, [e0, e1] = m.eRange;
  return {
    X: v => PL + (v - x0) / (x1 - x0) * (PR - PL),
    Y: e => PB - (e - e0) / (e1 - e0) * (PB - PT),
    invX: px => x0 + (px - PL) / (PR - PL) * (x1 - x0),
  };
}

const f2 = v => (Math.abs(v) < 0.005 ? 0 : v).toFixed(2);

/** Static or live SVG of the curve, the atom(s) and the force at position x; uid keeps ids unique. */
export function pesSVG(key, x, uid = 'p') {
  const m = MODELS[key];
  const { X, Y } = scales(m);
  const [x0, x1] = m.range, [e0, e1] = m.eRange;
  let path = '';
  for (let i = 0; i <= 320; i++) {
    const v = x0 + (x1 - x0) * i / 320;
    path += (i ? 'L' : 'M') + X(v).toFixed(1) + ' ' + Y(m.E(v)).toFixed(1);
  }
  let grid = '';
  for (let v = Math.ceil(x0 / 0.5) * 0.5; v <= x1 + 1e-9; v += 0.5) {
    grid += `<line class="grid" x1="${X(v)}" y1="${PT}" x2="${X(v)}" y2="${PB}"/><text class="tick" x="${X(v)}" y="${PB + 16}" text-anchor="middle">${+v.toFixed(2)}</text>`;
  }
  for (let e = Math.ceil(e0 / m.ticks) * m.ticks; e <= e1 + 1e-9; e += m.ticks) {
    grid += `<line class="grid" x1="${PL}" y1="${Y(e)}" x2="${PR}" y2="${Y(e)}"/><text class="tick" x="${PL - 8}" y="${Y(e) + 4}" text-anchor="end">${+e.toFixed(2)}</text>`;
  }
  const E = m.E(x), F = -m.dE(x);
  const mx = X(x), my = Y(Math.max(e0, Math.min(e1, E)));
  // the atoms above the plot, with the force as an arrow (length grows with |F|, capped)
  const len = Math.min(90, 28 * Math.sqrt(Math.abs(F)));
  const dir = Math.sign(F);
  const arrow = (cx, d) => (Math.abs(F) < FMAX ? '' :
    `<line class="farrow" x1="${cx + d * 16}" y1="62" x2="${cx + d * (16 + len)}" y2="62" marker-end="url(#pes-arrow-${uid})"/>`);
  let atoms;
  if (key === 'morse') {
    const k = 60, mid = (PL + PR) / 2, half = x * k / 2;
    atoms = `<line class="bond" x1="${mid - half}" y1="62" x2="${mid + half}" y2="62"/>
      <circle class="atom" cx="${mid - half}" cy="62" r="14"/><circle class="atom b" cx="${mid + half}" cy="62" r="14"/>
      ${arrow(mid + half, dir)}${arrow(mid - half, -dir)}
      <text class="lbl" x="${mid}" y="34" text-anchor="middle">R = ${x.toFixed(2)} Å</text>`;
  } else {
    atoms = `<line class="track" x1="${PL}" y1="62" x2="${PR}" y2="62"/>
      <circle class="atom b" cx="${mx}" cy="62" r="14"/>${arrow(mx, dir)}
      <text class="lbl" x="${mx}" y="34" text-anchor="middle">x = ${x.toFixed(2)} Å</text>`;
  }
  return `<svg class="pes-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Model potential-energy curve with the atom at ${x.toFixed(2)} Å, energy ${E.toFixed(2)} eV and force ${F.toFixed(2)} eV per ångström">
    <defs><marker id="pes-arrow-${uid}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path class="head" d="M0 0 L10 5 L0 10 z"/></marker>
      <clipPath id="pes-clip-${uid}"><rect x="${PL}" y="${PT}" width="${PR - PL}" height="${PB - PT}"/></clipPath></defs>
    ${atoms}
    ${grid}
    ${e0 < 0 && e1 > 0 ? `<line class="zero" x1="${PL}" y1="${Y(0)}" x2="${PR}" y2="${Y(0)}"/>` : ''}
    <path class="curve" d="${path}" clip-path="url(#pes-clip-${uid})"/>
    <line class="ax" x1="${PL}" y1="${PB}" x2="${PR}" y2="${PB}"/><line class="ax" x1="${PL}" y1="${PT}" x2="${PL}" y2="${PB}"/>
    <text class="axl" x="${(PL + PR) / 2}" y="${H - 6}" text-anchor="middle">${m.axis}</text>
    <text class="axl" x="16" y="${(PT + PB) / 2}" text-anchor="middle" transform="rotate(-90 16 ${(PT + PB) / 2})">Energy (eV)</text>
    <circle class="marker" cx="${mx}" cy="${my}" r="8"/>
  </svg>`;
}

export const snapshots = {
  pes: () => pesSVG('morse', MODELS.morse.start, 'sa'),
  pesDouble: () => pesSVG('double', MODELS.double.start, 'sb'),
};

let figCount = 0;

/** <figure data-fig="pes" data-model="morse|double" [data-starts="0.35,-0.3,0.06"]> */
export function pes(fig) {
  const uid = 'f' + (++figCount);
  const key = fig.dataset.model || 'morse';
  const m = MODELS[key];
  const starts = (fig.dataset.starts || '').split(',').filter(Boolean).map(Number);
  const body = fig.querySelector('.fig-body');
  const panel = document.createElement('div');
  panel.className = 'fig-panel';
  panel.innerHTML = `${starts.length ? `<p>Start from <span class="seg">${starts.map((v, i) => `<button type="button" data-start="${v}"${i ? '' : ' class="on"'}>${v.toFixed(2)} Å</button>`).join('')}</span></p>` : ''}
    <label>${key === 'morse' ? 'R' : 'x'} <input type="range" step="0.01" min="${m.range[0]}" max="${m.range[1]}" aria-label="Position in ångströms"></label>
    <p class="row"><button type="button" class="btn-step" data-act="step">One step</button><button type="button" class="btn-step play" data-act="relax">Relax</button><button type="button" class="btn-step" data-act="reset">Reset</button></p>
    <p class="readout" aria-live="polite"></p>
    <table class="tbl pes-log"><thead><tr><th>Ionic step</th><th>${key === 'morse' ? 'R' : 'x'} (Å)</th><th>E (eV)</th><th>|F| (eV/Å)</th></tr></thead><tbody></tbody></table>`;
  body.after(panel);
  const slider = panel.querySelector('input');
  const readout = panel.querySelector('.readout');
  const log = panel.querySelector('tbody');
  const relaxBtn = panel.querySelector('[data-act="relax"]');
  const ROWS = 5;

  let x0 = starts[0] ?? m.start, x = x0, steps = [], timer = 0;

  function status() {
    const F = -m.dE(x);
    if (Math.abs(F) < FMAX) {
      const kind = m.dE(x + 1e-3) - m.dE(x - 1e-3) > 0 ? 'a minimum' : 'a maximum (a barrier top)';
      return `<span class="pes-status done">|F| below 0.01 eV/Å: ${kind}</span>`;
    }
    if (steps.length > MAX_IONIC) return `<span class="pes-status">NSW reached before convergence</span>`;
    if (key === 'morse') return F > 0 ? 'Repulsive: the force pushes the atoms apart' : 'Attractive: the force pulls the atoms together';
    return F > 0 ? 'The force points to larger x' : 'The force points to smaller x';
  }
  function draw() {
    body.innerHTML = pesSVG(key, x, uid);
    slider.value = x;
    const F = -m.dE(x);
    readout.innerHTML = `E = <b>${f2(m.E(x))} eV</b> · F = −dE/d${key === 'morse' ? 'R' : 'x'} = <b>${F.toFixed(3)} eV/Å</b><br>${status()}`;
    const rows = steps.slice(-ROWS).map(s => `<tr><td>${s.n}</td><td>${s.x.toFixed(3)}</td><td>${s.E.toFixed(4)}</td><td>${s.F.toFixed(4)}</td></tr>`).join('');
    log.innerHTML = (steps.length > ROWS ? `<tr class="more"><td colspan="4">… ${steps.length - ROWS} earlier steps</td></tr>` : '') + rows;
  }
  // like OSZICAR, the starting geometry is ionic step 1
  function note() { steps.push({ n: steps.length + 1, x, E: m.E(x), F: Math.abs(m.dE(x)) }); }
  function stop() { clearInterval(timer); timer = 0; relaxBtn.textContent = 'Relax'; }
  function step() {
    if (!steps.length) note();
    if (Math.abs(m.dE(x)) < FMAX || steps.length > MAX_IONIC) { stop(); draw(); return false; }
    x = descend(m, x);
    note();
    draw();
    if (Math.abs(m.dE(x)) < FMAX) { stop(); return false; }
    return true;
  }
  function setX(v) { stop(); x = v; steps = []; draw(); }

  panel.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.start) {
      panel.querySelectorAll('[data-start]').forEach(o => o.classList.toggle('on', o === b));
      x0 = +b.dataset.start;
      setX(x0);
    } else if (b.dataset.act === 'step') { stop(); step(); }
    else if (b.dataset.act === 'reset') setX(x0);
    else if (b.dataset.act === 'relax') {
      if (timer) { stop(); return; }
      relaxBtn.textContent = 'Pause';
      if (step()) timer = setInterval(() => { if (!step()) stop(); }, 320);
    }
  });
  slider.addEventListener('input', () => setX(+slider.value));

  // drag along the curve
  let dragging = false;
  const toX = ev => {
    const r = body.querySelector('svg').getBoundingClientRect();
    // the SVG keeps its aspect ratio inside the box, so map through the drawn width
    const scale = Math.min(r.width / W, r.height / H);
    const px = (ev.clientX - r.left - (r.width - W * scale) / 2) / scale;
    return Math.max(m.range[0], Math.min(m.range[1], scales(m).invX(px)));
  };
  body.addEventListener('pointerdown', ev => { dragging = true; body.setPointerCapture(ev.pointerId); setX(toX(ev)); });
  body.addEventListener('pointermove', ev => { if (dragging) setX(toX(ev)); });
  body.addEventListener('pointerup', () => { dragging = false; });
  setX(x0);
}
