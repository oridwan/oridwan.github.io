/* VASP cheat sheets: copy buttons, print, the contents list, the hub search and the tools.
   The tool logic lives in cheat-tools.js (tested under Node); this file only builds the UI. */

import { BUILDER_OPTIONS, buildIncar, incarText, lintIncar, parsePoscar, meshFromKspacing, meshAdvice, kpointsText, potcarPlan, slurmScript, magmomSigns, magmomLine, START_MOMENT } from './cheat-tools.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem('cheat:' + k) || 'null'); } catch { return null; } },
  set(k, v) { try { localStorage.setItem('cheat:' + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};

/* ---------- copy buttons ---------- */
function addCopy(fig) {
  const cap = $('figcaption', fig);
  if (!cap || $('.copy-btn', cap)) return;
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'copy-btn';
  b.textContent = 'Copy';
  b.setAttribute('aria-label', `Copy: ${cap.textContent.trim()}`);
  b.addEventListener('click', async () => {
    const text = $('pre', fig).textContent.replace(/\s+$/, '') + '\n';
    try { await navigator.clipboard.writeText(text); }
    catch {
      const r = document.createRange(); r.selectNodeContents($('pre', fig));
      const s = getSelection(); s.removeAllRanges(); s.addRange(r); document.execCommand('copy'); s.removeAllRanges();
    }
    b.textContent = 'Copied'; b.classList.add('done');
    setTimeout(() => { b.textContent = 'Copy'; b.classList.remove('done'); }, 1600);
  });
  cap.append(b);
}
$$('figure.code').forEach(addCopy);

$('.print-btn')?.addEventListener('click', () => print());

/* ---------- contents list: mark the section at the top of the screen ---------- */
const tocLinks = $$('.sheet-toc a');
if (tocLinks.length) {
  const secs = $$('.sheet-sec');
  let ticking = false;
  const mark = () => {
    ticking = false;
    let cur = secs[0];
    for (const s of secs) if (s.getBoundingClientRect().top < 140) cur = s;
    tocLinks.forEach(a => a.classList.toggle('on', a.hash === '#' + cur.id));
  };
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(mark); } }, { passive: true });
  mark();
}

/* ---------- hub search ---------- */
const q = $('#hub-q');
if (q) {
  const items = $$('.cs-card, .tasks li, .tag-index tbody tr');
  const run = () => {
    const words = q.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
    for (const el of items) {
      const hay = (el.dataset.search || el.textContent).toLowerCase();
      const hit = words.every(w => hay.includes(w));
      if (hit) el.removeAttribute('data-hidden'); else el.setAttribute('data-hidden', '');
    }
  };
  q.addEventListener('input', run);
}

/* ---------- INCAR builder and checker ---------- */
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function highlightIncar(text) {
  return text.split('\n').map(line => {
    const i = line.search(/[!#]/);
    const stmt = i < 0 ? line : line.slice(0, i), com = i < 0 ? '' : line.slice(i);
    return esc(stmt).replace(/\b([A-Z][A-Z0-9_]*)(?=\s*=)/g, '<span class="k">$1</span>') + (com ? `<span class="c">${esc(com)}</span>` : '');
  }).join('\n');
}
function lintList(items) {
  if (!items.length) return '<ul class="lint"><li class="ok"><b>OK</b>No problems found by the rules on this sheet.</li></ul>';
  const word = { error: 'Error', warn: 'Warning', info: 'Note' };
  return `<ul class="lint">${items.map(p => `<li class="${p.level}"><b>${word[p.level]}</b>${esc(p.message)}</li>`).join('')}</ul>`;
}

function incarTool(root) {
  const known = new Set((root.dataset.known || '').split(/\s+/).filter(Boolean));
  const saved = store.get('builder') || {};
  const field = (key, label) => `<label>${label}<select name="${key}">${BUILDER_OPTIONS[key].map(([v, t]) =>
    `<option value="${v}"${saved[key] === v ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
  root.innerHTML = `
    <div class="tool-tabs" role="tablist">
      <button type="button" role="tab" aria-selected="true" data-tab="build">Build an INCAR</button>
      <button type="button" role="tab" aria-selected="false" data-tab="check">Check an INCAR</button>
    </div>
    <div data-pane="build" class="tool-grid">
      <form class="tool-form" onsubmit="return false">
        ${field('task', 'Task')}
        ${field('material', 'System')}
        ${field('spin', 'Magnetism')}
        <label class="mm">MAGMOM (optional)<input name="magmom" type="text" placeholder="e.g. 2*3.0 4*0.6" value="${esc(saved.magmom || '')}" spellcheck="false"><span class="hint">One value per atom, in POSCAR order.</span></label>
        ${field('xc', 'Functional')}
        ${field('elements', 'Heaviest open shell')}
        ${field('size', 'Cell size')}
        <label>Largest ENMAX in your POTCAR (eV)<input name="enmax" type="number" min="50" max="2000" step="any" value="${esc(saved.enmax || 400)}"><span class="hint"><code>grep ENMAX POTCAR</code>; ENCUT is set to 1.3 × this.</span></label>
      </form>
      <div class="tool-out">
        <figure class="code incar"><figcaption><span class="code-t">INCAR</span></figcaption><pre><code></code></pre></figure>
        <ul class="tool-notes"></ul>
      </div>
    </div>
    <div data-pane="check" hidden>
      <label for="incar-in" class="visually-hidden">Paste an INCAR</label>
      <textarea id="incar-in" spellcheck="false" placeholder="Paste an INCAR here"></textarea>
      <div class="check-out"></div>
    </div>`;
  const form = $('form', root);
  const out = $('.tool-out pre code', root);
  const notes = $('.tool-notes', root);
  addCopy($('.tool-out figure', root));

  const update = () => {
    const o = Object.fromEntries(new FormData(form));
    store.set('builder', o);
    $('.mm', root).hidden = o.spin === 'none';
    const r = buildIncar(o);
    out.innerHTML = highlightIncar(incarText(r).replace(/\n$/, ''));
    const lint = lintIncar(incarText(r), known).filter(p => p.level !== 'info');
    notes.innerHTML = [...r.notes.map(n => `<li>${esc(n)}</li>`), ...lint.map(p => `<li><b>${p.level === 'error' ? 'Error' : 'Warning'}:</b> ${esc(p.message)}</li>`)].join('');
  };
  form.addEventListener('input', update);
  form.addEventListener('change', update);
  update();

  const ta = $('textarea', root), res = $('.check-out', root);
  const check = () => { res.innerHTML = ta.value.trim() ? lintList(lintIncar(ta.value, known)) : ''; };
  ta.addEventListener('input', check);

  $$('.tool-tabs button', root).forEach(b => b.addEventListener('click', () => {
    $$('.tool-tabs button', root).forEach(x => x.setAttribute('aria-selected', String(x === b)));
    $$('[data-pane]', root).forEach(p => { p.hidden = p.dataset.pane !== b.dataset.tab; });
  }));
}
$$('[data-tool="incar-builder"]').forEach(incarTool);

/* ---------- POSCAR-based tools: k-mesh calculator and POSCAR checker ---------- */
const SAMPLE = 'Si, conventional cubic cell\n1.0\n5.430 0.000 0.000\n0.000 5.430 0.000\n0.000 0.000 5.430\nSi\n8\nDirect\n0.00 0.00 0.00\n0.50 0.50 0.00\n0.50 0.00 0.50\n0.00 0.50 0.50\n0.25 0.25 0.25\n0.75 0.75 0.25\n0.75 0.25 0.75\n0.25 0.75 0.75\n';
const f3 = x => x.toFixed(3);
const SHAPES = { fcc: 'fcc (primitive cell)', bcc: 'bcc (primitive cell)', cubic: 'cubic', hexagonal: 'hexagonal', rhombohedral: 'rhombohedral (primitive cell)', tetragonal: 'tetragonal', orthorhombic: 'orthorhombic', other: 'lower symmetry or non-standard setting' };
function cellSummary(p) {
  const q = p.params;
  const names = p.species || p.counts.map((_, i) => 'type ' + (i + 1));
  return `<dl class="cell-sum">
    <div><dt>Atoms</dt><dd>${p.natoms} (${names.map((s, i) => esc(s) + ' ' + p.counts[i]).join(', ')})</dd></div>
    <div><dt>a, b, c (Å)</dt><dd>${f3(q.a)}, ${f3(q.b)}, ${f3(q.c)}</dd></div>
    <div><dt>α, β, γ (°)</dt><dd>${q.alpha.toFixed(2)}, ${q.beta.toFixed(2)}, ${q.gamma.toFixed(2)}</dd></div>
    <div><dt>Volume</dt><dd>${f3(p.volume)} Å³ (${f3(p.volume / p.natoms)} per atom)</dd></div>
    <div><dt>Cell shape</dt><dd>${SHAPES[p.shape]}</dd></div>
    ${p.minDist != null ? `<div><dt>Shortest distance</dt><dd>${f3(p.minDist)} Å, atoms ${p.minPair.join(' and ')}</dd></div>` : ''}
  </dl>`;
}
function problems(p) {
  return lintList([...p.errors.map(m => ({ level: 'error', message: m })), ...p.warnings.map(m => ({ level: 'warn', message: m }))]);
}

function kmeshTool(root) {
  const saved = store.get('kmesh') || {};
  root.innerHTML = `
    <div class="tool-grid">
      <form class="tool-form" onsubmit="return false">
        <label>POSCAR<textarea name="poscar" spellcheck="false" rows="12">${esc(saved.poscar || SAMPLE)}</textarea></label>
        <label>KSPACING (Å⁻¹, 2π included)<input name="ksp" type="number" min="0.02" max="2" step="0.01" value="${esc(saved.ksp || 0.25)}"><span class="hint">Smaller is denser. 0.5 is VASP's default, coarse for metals.</span></label>
        <label>Mesh<select name="gamma"><option value="1">Γ-centred</option><option value="0"${saved.gamma === '0' ? ' selected' : ''}>Monkhorst–Pack</option></select></label>
      </form>
      <div class="tool-out"></div>
    </div>`;
  const form = $('form', root), out = $('.tool-out', root);
  const update = () => {
    const o = Object.fromEntries(new FormData(form));
    store.set('kmesh', o);
    const p = parsePoscar(o.poscar);
    if (p.errors.length || !p.lattice) { out.innerHTML = problems(p); return; }
    const ksp = parseFloat(o.ksp);
    if (!(ksp > 0)) { out.innerHTML = lintList([{ level: 'error', message: 'Enter a positive KSPACING.' }]); return; }
    const gamma = o.gamma === '1';
    const N = meshFromKspacing(p.lattice, ksp);
    const total = N[0] * N[1] * N[2];
    const notes = meshAdvice(p.shape, N, gamma).map(m => ({ level: 'info', message: m })).concat(p.warnings.map(m => ({ level: 'warn', message: m })));
    out.innerHTML = `${cellSummary(p)}
      <p class="mesh-big">${N.join(' × ')} <span>${total} k-points in the full zone; × ${p.natoms} atoms = ${total * p.natoms} k-points per atom</span></p>
      <figure class="code kpoints"><figcaption><span class="code-t">KPOINTS</span></figcaption><pre><code>${esc(kpointsText(N, gamma, `KSPACING ${ksp}`))}</code></pre></figure>
      ${notes.length ? lintList(notes) : ''}`;
    addCopy($('figure', out));
  };
  form.addEventListener('input', update);
  update();
}
$$('[data-tool="kmesh"]').forEach(kmeshTool);

function poscarTool(root) {
  root.innerHTML = `
    <div class="tool-grid">
      <form class="tool-form" onsubmit="return false">
        <label>POSCAR or CONTCAR<textarea name="poscar" spellcheck="false" rows="14">${esc(SAMPLE)}</textarea></label>
      </form>
      <div class="tool-out"></div>
    </div>`;
  const form = $('form', root), out = $('.tool-out', root);
  const update = () => {
    const p = parsePoscar(new FormData(form).get('poscar'));
    out.innerHTML = (p.lattice && p.counts && !p.errors.length ? cellSummary(p) : '') + problems(p);
  };
  form.addEventListener('input', update);
  update();
}
$$('[data-tool="poscar"]').forEach(poscarTool);

function potcarTool(root) {
  const saved = store.get('potcar') || {};
  root.innerHTML = `
    <div class="tool-grid">
      <form class="tool-form" onsubmit="return false">
        <label>Species line (POSCAR line 6)<input name="species" type="text" spellcheck="false" value="${esc(saved.species || 'Nd Fe B')}"><span class="hint">Element symbols, or potential names such as Fe_sv to override.</span></label>
        <label>Counts line (optional)<input name="counts" type="text" spellcheck="false" value="${esc(saved.counts ?? '2 14 1')}"><span class="hint">Gives the number of valence electrons (NELECT of the neutral cell).</span></label>
      </form>
      <div class="tool-out"></div>
    </div>`;
  const form = $('form', root), out = $('.tool-out', root);
  const update = () => {
    const o = Object.fromEntries(new FormData(form));
    store.set('potcar', o);
    const p = potcarPlan(o.species, o.counts);
    if (!p.rows.length) { out.innerHTML = ''; return; }
    const rows = p.rows.map(r => `<tr><th scope="row">${esc(r.el)}</th><td><code>${esc(r.pot)}</code></td><td>${r.zval ?? '—'}</td><td>${r.enmax ?? '—'}</td></tr>`).join('');
    const notes = p.rows.filter(r => r.note).map(r => ({ level: r.known ? 'warn' : 'error', message: r.note }));
    out.innerHTML = `<div class="tagtable-wrap"><table class="choice potcar-plan"><thead><tr><th scope="col">Element</th><th scope="col">Potential</th><th scope="col">Valence e⁻</th><th scope="col">ENMAX <span class="nt">(eV)</span></th></tr></thead><tbody>${rows}</tbody></table></div>
      ${p.maxEnmax ? `<p class="mesh-big" style="font-size:1.1rem">Default ENCUT ${p.maxEnmax} eV <span>Set it explicitly; for cell relaxations use at least 1.3 × this: ${p.encut13} eV.${p.nelect != null ? ` Valence electrons in the cell: ${p.nelect}.` : ''}</span></p>` : ''}
      <figure class="code sh"><figcaption><span class="code-t">Build the POTCAR</span></figcaption><pre><code>POTDIR=/path/to/potpaw_PBE.64
${esc(p.cat)}
grep TITEL POTCAR</code></pre></figure>
      ${notes.length ? lintList(notes) : ''}`;
    addCopy($('figure', out));
  };
  form.addEventListener('input', update);
  update();
}
$$('[data-tool="potcar"]').forEach(potcarTool);

/* ---------- Slurm script generator ---------- */
function slurmTool(root) {
  const d = Object.assign({ name: 'relax', nodes: 2, ranksPerNode: 64, threads: 1, gpusPerNode: 0, time: '24:00:00', exe: 'vasp_std', kpts: '', signalMinutes: 15 }, store.get('slurm') || {});
  const num = (n, label, v, hint = '', min = 0) => `<label>${label}<input name="${n}" type="number" min="${min}" step="1" value="${esc(v)}">${hint ? `<span class="hint">${hint}</span>` : ''}</label>`;
  root.innerHTML = `
    <div class="tool-grid">
      <form class="tool-form" onsubmit="return false">
        <label>Job name<input name="name" type="text" value="${esc(d.name)}" spellcheck="false"></label>
        ${num('nodes', 'Nodes', d.nodes, '', 1)}
        ${num('ranksPerNode', 'MPI ranks per node', d.ranksPerNode, 'On GPU nodes: one per GPU.', 1)}
        ${num('threads', 'OpenMP threads per rank', d.threads, 'Ranks × threads ≤ physical cores per node.', 1)}
        ${num('gpusPerNode', 'GPUs per node', d.gpusPerNode, '0 for a CPU job.')}
        <label>Executable<select name="exe">${['vasp_std', 'vasp_gam', 'vasp_ncl'].map(x => `<option${d.exe === x ? ' selected' : ''}>${x}</option>`).join('')}</select></label>
        <label>Time limit<input name="time" type="text" value="${esc(d.time)}" spellcheck="false"><span class="hint">HH:MM:SS or D-HH:MM:SS</span></label>
        ${num('kpts', 'Irreducible k-points (optional)', d.kpts, 'From grep "irreducible k-points" OUTCAR or a dry run.')}
        ${num('signalMinutes', 'Stop VASP this many minutes before the limit', d.signalMinutes, '0 for no STOPCAR trap.')}
      </form>
      <div class="tool-out"></div>
    </div>`;
  const form = $('form', root), out = $('.tool-out', root);
  const update = () => {
    const o = Object.fromEntries(new FormData(form));
    store.set('slurm', o);
    const r = slurmScript(o);
    out.innerHTML = `${r.errors.length ? lintList(r.errors.map(m => ({ level: 'error', message: m }))) : ''}
      <figure class="code sh"><figcaption><span class="code-t">job.sh</span></figcaption><pre><code>${esc(r.script)}</code></pre></figure>
      ${r.incar.length ? `<figure class="code incar"><figcaption><span class="code-t">Add to the INCAR</span></figcaption><pre><code>${highlightIncar(r.incar.join('\n'))}</code></pre></figure>` : ''}
      <ul class="tool-notes">${r.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>`;
    $$('figure', out).forEach(addCopy);
  };
  form.addEventListener('input', update);
  update();
}
$$('[data-tool="slurm"]').forEach(slurmTool);

/* ---------- MAGMOM builder ---------- */
const MAG_SAMPLE = 'Rocksalt NiO, 2 formula units (tetragonal cell)\n1.0\n2.95 0 0\n0 2.95 0\n0 0 4.175\nNi O\n2 2\nDirect\n0 0 0\n0.5 0.5 0.5\n0.5 0.5 0\n0 0 0.5\n';
function magmomTool(root) {
  const saved = store.get('magmom') || {};
  root.innerHTML = `
    <div class="tool-grid">
      <form class="tool-form" onsubmit="return false">
        <label>POSCAR<textarea name="poscar" spellcheck="false" rows="10">${esc(saved.poscar || MAG_SAMPLE)}</textarea></label>
        <div class="mm-species"></div>
        <label>Pattern<select name="pattern">
          <option value="fm">Ferromagnetic</option>
          <option value="layers-a">Antiferromagnetic: alternate planes along a</option>
          <option value="layers-b">Antiferromagnetic: alternate planes along b</option>
          <option value="layers-c">Antiferromagnetic: alternate planes along c</option>
          <option value="custom">Custom: set each site below</option>
        </select></label>
        <label class="inline"><input type="checkbox" name="ncl"> Noncollinear (vasp_ncl): three numbers per atom, along the spin axis</label>
      </form>
      <div class="tool-out"></div>
    </div>`;
  const form = $('form', root), out = $('.tool-out', root), spBox = $('.mm-species', root);
  let p = null, signs = [], speciesKey = '';
  const moments = () => Object.fromEntries($$('input[data-sp]', spBox).map(i => [i.dataset.sp, parseFloat(i.value) || 0]));
  const render = () => {
    if (!p || p.errors.length || !p.sites) { out.innerHTML = p ? lintList(p.errors.map(m => ({ level: 'error', message: m }))) : ''; return; }
    const o = Object.fromEntries(new FormData(form));
    const mom = moments();
    if (o.pattern !== 'custom') signs = magmomSigns(p, mom, o.pattern);
    const r = magmomLine(p, mom, signs, !!o.ncl);
    const oddPlanes = o.pattern.startsWith('layers') && signs.planes % 2 === 1;
    const sites = p.sites.length <= 64 ? `<div class="tagtable-wrap"><table class="choice mm-sites"><thead><tr><th scope="col">#</th><th scope="col">Species</th><th scope="col">Position (fractional)</th><th scope="col">Sign</th></tr></thead><tbody>${p.sites.map((s, i) => `<tr><th scope="row">${i + 1}</th><td>${esc(s)}</td><td>${p.positions[i].map(x => x.toFixed(3)).join(' ')}</td><td><select data-i="${i}"${mom[s] ? '' : ' disabled'}><option value="1"${signs[i] > 0 ? ' selected' : ''}>+</option><option value="-1"${signs[i] < 0 ? ' selected' : ''}>−</option><option value="0"${!signs[i] ? ' selected' : ''}>0</option></select></td></tr>`).join('')}</tbody></table></div>` : '<p class="hint">More than 64 sites: the site list is hidden; the pattern still applies.</p>';
    out.innerHTML = `<figure class="code incar"><figcaption><span class="code-t">INCAR lines</span></figcaption><pre><code>${highlightIncar(`${o.ncl ? 'LNONCOLLINEAR = .TRUE.' : 'ISPIN = 2'}\nMAGMOM = ${r.line}`)}</code></pre></figure>
      <p class="hint">${r.count} numbers for ${p.natoms} atoms; total starting moment ${r.total.toFixed(2)} μB${Math.abs(r.total) < 1e-9 && o.pattern !== 'fm' ? ' (antiferromagnetic: zero net moment)' : ''}. Check that the pattern is the order you mean; for complex orders, enumerate orderings.</p>
      ${oddPlanes ? lintList([{ level: 'warn', message: `There are ${signs.planes} planes of magnetic atoms along this axis, an odd number, so the alternation cannot repeat across the cell boundary. Double the cell along this axis or choose another pattern.` }]) : ''}
      ${sites}`;
    addCopy($('figure', out));
    $$('select[data-i]', out).forEach(sel => sel.addEventListener('change', () => {
      signs[+sel.dataset.i] = +sel.value;
      form.pattern.value = 'custom';
      render();
    }));
  };
  const parse = () => {
    const text = form.poscar.value;
    store.set('magmom', { poscar: text });
    p = parsePoscar(text);
    const names = p.species || (p.counts || []).map((_, i) => `type ${i + 1}`);
    const key = names.join(' ');
    if (key !== speciesKey) {
      speciesKey = key;
      spBox.innerHTML = names.length ? `<p class="mm-k">Starting moment per species (μB)</p>` + names.map(n => `<label class="inline">${esc(n)} <input data-sp="${esc(n)}" type="number" step="0.1" value="${START_MOMENT[n] ?? 0}"></label>`).join('') + `<p class="hint">Suggested high-spin starts; edit them for your oxidation states.</p>` : '';
    }
    signs = p.sites ? p.sites.map(() => 1) : [];
    render();
  };
  form.poscar.addEventListener('input', parse);
  form.addEventListener('change', e => { if (e.target.name !== 'poscar') render(); });
  spBox.addEventListener('input', render);
  parse();
}
$$('[data-tool="magmom"]').forEach(magmomTool);

/* ---------- finder: jump to a command or an error entry ---------- */
function finderTool(root) {
  const items = $$(root.dataset.items).map((el, i) => {
    if (!el.id) el.id = 'find-' + i;
    const title = ($('figcaption .code-t, h3, th', el) || el).textContent.trim();
    const keys = (el.dataset.keys || '').toLowerCase().split('|').filter(Boolean);
    return { el, title, text: el.textContent.toLowerCase(), keys };
  });
  const multi = root.dataset.multiline === '1';
  root.innerHTML = `<label class="finder"><span>${esc(root.dataset.label)}</span>${multi
    ? `<textarea rows="3" spellcheck="false" placeholder="${esc(root.dataset.placeholder)}"></textarea>`
    : `<input type="search" autocomplete="off" placeholder="${esc(root.dataset.placeholder)}">`}</label><ol class="finder-out"></ol>`;
  const box = $('input, textarea', root), out = $('.finder-out', root);
  box.addEventListener('input', () => {
    const q = box.value.toLowerCase().trim();
    if (!q) { out.innerHTML = ''; return; }
    let hits = items.filter(it => it.keys.some(k => q.includes(k)));
    if (!hits.length) {
      const words = q.split(/[^a-z0-9_+.-]+/).filter(w => w.length > 1);
      hits = items.filter(it => words.length && words.every(w => it.text.includes(w)));
    }
    out.innerHTML = hits.length
      ? hits.slice(0, 12).map(it => `<li><a href="#${it.el.id}">${esc(it.title)}</a></li>`).join('')
      : '<li class="none">No match. Try one distinctive word from the message.</li>';
  });
}
$$('[data-tool="finder"]').forEach(finderTool);
