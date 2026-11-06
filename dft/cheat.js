/* VASP cheat sheets: copy buttons, print, the contents list, the hub search and the tools.
   The tool logic lives in cheat-tools.js (tested under Node); this file only builds the UI. */

import { BUILDER_OPTIONS, buildIncar, incarText, lintIncar } from './cheat-tools.js';

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
