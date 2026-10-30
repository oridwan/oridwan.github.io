/* DFT course pages: slide rail and progress, presentation mode (one 16:9 frame per screen, with
   builds), a speaker-notes window, popovers for key terms, VASP tags and references, clickable
   equation terms, flip cards, lazily loaded interactive figures, and each visitor's progress
   (kept in localStorage; the pages work without it).

   Interactive figures live in figs/<slug>.js and export one function per figure name:
   <figure data-fig="name"> calls name(figureElement) when the figure first comes into view. */

const KEY = 'dft-progress';
const store = {
  get() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } },
  put(slug, rec) { try { const p = store.get(); p[slug] = rec; localStorage.setItem(KEY, JSON.stringify(p)); } catch {} },
};

const body = document.body;
document.documentElement.classList.add('js');

/* ---------------- lecture page ---------------- */

function lecture(slug) {
  const slides = [...document.querySelectorAll('.lec-main .deck-slide')];
  const spied = [...document.querySelectorAll('.lec-main .deck-slide, .lec-main .backmatter')];
  const rail = [...document.querySelectorAll('.rail a')];
  const railIndex = new Map(rail.map(a => [a.hash.slice(1), a]));
  const bar = document.querySelector('.progress span');
  let current = 0;      // index into slides
  let presenting = false;
  let shown = 0;        // builds revealed on the current slide while presenting
  let win = null, clock = 0, started = 0;   // speaker-notes window and its clock

  const prev = store.get()[slug] || { seen: 0, done: false };
  function record(i) {
    if (i <= prev.seen && prev.done) return;
    prev.seen = Math.max(prev.seen, i);
    prev.done = prev.done || i >= slides.length - 1;
    prev.t = Date.now();
    store.put(slug, prev);
  }

  // scroll position → current section, rail highlight and progress bar
  let ticking = false;
  function onScroll() {
    ticking = false;
    if (presenting) return;
    const line = innerHeight * 0.45;
    let k = 0;
    for (let j = 0; j < spied.length; j++) if (spied[j].getBoundingClientRect().top <= line) k = j;
    rail.forEach(a => a.classList.remove('on'));
    railIndex.get(spied[k].id)?.classList.add('on');
    const i = slides.indexOf(spied[k]);
    if (i >= 0 && i !== current) { current = i; record(i); syncNotes(); }
    const max = document.documentElement.scrollHeight - innerHeight;
    if (bar) bar.style.transform = `scaleX(${max > 0 ? Math.min(1, scrollY / max) : 1})`;
  }
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  addEventListener('resize', onScroll);
  onScroll();

  // presentation mode
  const help = document.createElement('p');
  help.className = 'present-help';
  help.innerHTML = '<kbd>→</kbd> next · <kbd>←</kbd> back · <kbd>S</kbd> notes · <kbd>Esc</kbd> exit';
  body.append(help);
  let helpTimer = 0;
  const steps = i => [...slides[i].querySelectorAll('.frame .step')];

  function reveal(i, n) {
    const s = steps(i);
    shown = Math.max(0, Math.min(s.length, n));
    s.forEach((el, k) => el.classList.toggle('shown', k < shown));
  }
  function show(i, atEnd = false) {
    current = Math.max(0, Math.min(slides.length - 1, i));
    slides.forEach((s, k) => s.classList.toggle('current', k === current));
    reveal(current, atEnd ? Infinity : 0);
    if (bar) bar.style.transform = `scaleX(${(current + 1) / slides.length})`;
    history.replaceState(null, '', '#' + slides[current].id);
    record(current);
    syncNotes();
  }
  function forward() {
    if (shown < steps(current).length) reveal(current, shown + 1);
    else if (current < slides.length - 1) show(current + 1);
  }
  function backward() {
    if (shown > 0) reveal(current, shown - 1);
    else if (current > 0) show(current - 1, true);
  }
  function present(on) {
    presenting = on;
    closePop();
    body.classList.toggle('presenting', on);
    if (on) {
      show(current);
      document.documentElement.requestFullscreen?.().catch(() => {});
      help.classList.add('show');
      clearTimeout(helpTimer);
      helpTimer = setTimeout(() => help.classList.remove('show'), 3500);
      startClock();
    } else {
      slides.forEach(s => s.classList.remove('current'));
      help.classList.remove('show');
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      slides[current].scrollIntoView({ block: 'start' });
    }
  }
  document.querySelector('.present-btn')?.addEventListener('click', () => present(!presenting));
  document.querySelector('.notes-btn')?.addEventListener('click', openNotes);
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && presenting) present(false); });

  document.addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Escape') {
      if (!pop.hidden) { closePop(true); return; }
      if (presenting) present(false);
      return;
    }
    if (e.target.closest('input, select, textarea, [contenteditable]')) return;
    const onControl = e.target.closest('button, summary, [role="button"], .eq-legend li');
    if ((e.key === 'p' || e.key === 'P') && !onControl) { e.preventDefault(); present(!presenting); return; }
    if ((e.key === 's' || e.key === 'S') && !onControl) { e.preventDefault(); openNotes(); return; }
    if (!presenting) return;
    if (onControl && (e.key === ' ' || e.key === 'Enter')) return;
    if (['ArrowRight', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); forward(); }
    else if (['ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); backward(); }
    else if (e.key === 'Home') { e.preventDefault(); show(0); }
    else if (e.key === 'End') { e.preventDefault(); show(slides.length - 1, true); }
  });

  // in presentation mode, hash links (#slide-id) jump to that slide
  addEventListener('hashchange', () => {
    if (!presenting) return;
    const i = slides.findIndex(s => s.id === location.hash.slice(1));
    if (i >= 0 && i !== current) show(i);
  });

  // speaker notes: a second window that follows the current slide
  function startClock() { if (!started) started = Date.now(); }
  function openNotes() {
    if (win && !win.closed) { win.focus(); return; }
    win = window.open('', 'dft-speaker-notes', 'width=620,height=760');
    if (!win) return;
    const css = [...document.querySelectorAll('link[rel="stylesheet"]')].map(l => `<link rel="stylesheet" href="${l.href}">`).join('');
    win.document.open();
    win.document.write(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Speaker notes · ${document.title}</title>${css}
      <style>body{margin:0;padding:18px 22px;font:16px/1.65 var(--sans)} .sn-top{display:flex;justify-content:space-between;gap:12px;font-size:.85rem;color:var(--muted);border-bottom:1px solid var(--line);padding-bottom:8px;margin-bottom:12px}
      .sn-claim{font:600 1.25rem/1.3 var(--serif);color:var(--ink);margin:0 0 14px} .sn-next{margin-top:22px;padding-top:10px;border-top:1px solid var(--line);font-size:.85rem;color:var(--muted)} .notes{margin:0;font-size:1.05rem}</style></head>
      <body class="dft"><div class="sn-top"><span id="sn-pos"></span><span id="sn-clock">0:00</span></div><div id="sn-body"></div><p class="sn-next" id="sn-next"></p></body></html>`);
    win.document.close();
    clearInterval(clock);
    clock = setInterval(() => {
      if (!win || win.closed) { clearInterval(clock); return; }
      const s = started ? Math.floor((Date.now() - started) / 1000) : 0;
      win.document.getElementById('sn-clock').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }, 1000);
    syncNotes();
  }
  function syncNotes() {
    if (!win || win.closed) return;
    const s = slides[current];
    const d = win.document;
    const kicker = s.querySelector('.frame h2, .frame h1')?.textContent || '';
    const claim = s.querySelector('.frame .claim, .frame .question')?.innerHTML || '';
    const notes = s.querySelector(':scope > .notes');
    d.getElementById('sn-pos').textContent = `Slide ${current + 1} of ${slides.length} · ${kicker}`;
    d.getElementById('sn-body').innerHTML = `<p class="sn-claim">${claim}</p>${notes ? `<div class="notes">${notes.innerHTML}</div>` : '<p>(No notes for this slide.)</p>'}`;
    const next = slides[current + 1]?.querySelector('.frame h2');
    d.getElementById('sn-next').textContent = next ? `Next: ${next.textContent}` : 'Last slide.';
  }
  addEventListener('beforeunload', () => { if (win && !win.closed) win.close(); });

  equations();
  flips();
  figures(slug);
  addEventListener('beforeprint', () => document.querySelectorAll('details').forEach(d => { d.open = true; }));
}

/* ---------------- popovers: key terms, VASP tags, references ---------------- */

const pop = document.createElement('div');
pop.className = 'pop';
pop.setAttribute('role', 'dialog');
pop.tabIndex = -1;
pop.hidden = true;
body.append(pop);
let popFrom = null;
let hoverTimer = 0;

function popContent(a) {
  const target = document.getElementById(decodeURIComponent(a.hash.slice(1)));
  if (!target) return null;
  if (target.tagName === 'DT') {
    const dd = target.nextElementSibling;
    const kind = a.classList.contains('vtag') ? 'VASP tag' : 'Key term';
    return `<p class="pop-k">${kind}</p><p class="pop-title">${target.innerHTML}</p><div class="pop-body">${dd ? dd.innerHTML : ''}</div>`
      + `<a class="pop-more" href="#${target.id}">See all key terms</a>`;
  }
  return `<p class="pop-k">Reference</p><div class="pop-body">${target.innerHTML}</div>`
    + `<a class="pop-more" href="#${target.id}">See all references</a>`;
}

function openPop(a, pinned) {
  const html = popContent(a);
  if (!html) return false;
  popFrom = a;
  pop.innerHTML = html;
  pop.dataset.pinned = pinned ? '1' : '';
  pop.hidden = false;
  const r = a.getBoundingClientRect();
  const w = Math.min(380, innerWidth - 16);
  pop.style.width = w + 'px';
  pop.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + 'px';
  const h = pop.offsetHeight;
  const below = r.bottom + 8 + h <= innerHeight - 8 || r.top < h + 16;
  pop.style.top = (below ? r.bottom + 8 : r.top - h - 8) + 'px';
  return true;
}

function closePop(refocus) {
  if (pop.hidden) return;
  pop.hidden = true;
  if (refocus && popFrom) popFrom.focus();
  popFrom = null;
}

document.addEventListener('click', e => {
  const a = e.target.closest('a.term, a.vtag, a.ref');
  if (a && !a.closest('.pop')) {
    if (popFrom === a && pop.dataset.pinned) { closePop(); e.preventDefault(); return; }
    if (openPop(a, true)) {
      e.preventDefault();
      if (e.detail === 0) pop.focus(); // opened from the keyboard
    }
    return;
  }
  if (e.target.closest('.pop-more')) {
    closePop();
    if (body.classList.contains('presenting')) e.preventDefault();
    return;
  }
  if (!e.target.closest('.pop')) closePop();
});

// hover preview on devices with a fine pointer
if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
  document.addEventListener('mouseover', e => {
    const a = e.target.closest('a.term, a.vtag, a.ref');
    if (e.target.closest('.pop')) { clearTimeout(hoverTimer); return; }
    clearTimeout(hoverTimer);
    if (a && !a.closest('.pop')) {
      if (popFrom !== a) hoverTimer = setTimeout(() => openPop(a, false), 350);
    } else if (!pop.hidden && !pop.dataset.pinned) {
      hoverTimer = setTimeout(() => closePop(), 250);
    }
  });
}
addEventListener('scroll', () => closePop(), { passive: true, capture: true });
addEventListener('resize', () => closePop());

/* ---------------- clickable equation terms ---------------- */

function equations() {
  document.querySelectorAll('.eqbox').forEach(box => {
    const legend = [...box.querySelectorAll('.eq-legend [data-eq]')];
    legend.forEach(li => { li.tabIndex = 0; li.setAttribute('role', 'button'); });
    const mark = (k, on) => box.querySelectorAll(`[data-eq="${CSS.escape(k)}"]`).forEach(el => el.classList.toggle('on', on));
    const clear = () => box.querySelectorAll('[data-eq].on').forEach(el => el.classList.remove('on'));
    const pick = k => {
      const same = box.dataset.pinned === k;
      clear();
      if (same) delete box.dataset.pinned;
      else { box.dataset.pinned = k; mark(k, true); }
    };
    box.addEventListener('click', e => {
      if (e.target.closest('a')) return;
      const t = e.target.closest('[data-eq]');
      if (t) pick(t.dataset.eq);
    });
    box.addEventListener('keydown', e => {
      const t = e.target.closest('.eq-legend [data-eq]');
      if (t && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); pick(t.dataset.eq); }
    });
    box.addEventListener('mouseover', e => {
      const t = e.target.closest('[data-eq]');
      if (!t || box.dataset.pinned) return;
      clear(); mark(t.dataset.eq, true);
    });
    box.addEventListener('mouseleave', () => { if (!box.dataset.pinned) clear(); });
  });
}

/* ---------------- flip cards ---------------- */

function flips() {
  document.querySelectorAll('.flip').forEach(card => {
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-pressed', 'false');
    const flip = () => {
      const on = card.classList.toggle('on');
      card.setAttribute('aria-pressed', String(on));
    };
    card.addEventListener('click', e => { if (!e.target.closest('a')) flip(); });
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); }
    });
  });
}

/* ---------------- interactive figures, loaded when first scrolled near ---------------- */

function figures(slug) {
  const figs = document.querySelectorAll('[data-fig]');
  if (!figs.length) return;
  let mod;
  const load = () => (mod ??= import(new URL(`./figs/${slug}.js`, import.meta.url)));
  const start = async el => {
    if (el.classList.contains('live')) return;
    el.classList.add('live');
    try {
      const m = await load();
      m[el.dataset.fig]?.(el);
    } catch (err) {
      console.error(err);
    }
  };
  const io = new IntersectionObserver(entries => entries.forEach(e => {
    if (!e.isIntersecting) return;
    io.unobserve(e.target);
    start(e.target);
  }), { rootMargin: '300px 0px' });
  figs.forEach(f => io.observe(f));
  // presentation mode shows slides that were never scrolled into view
  new MutationObserver(() => {
    document.querySelectorAll('.deck-slide.current [data-fig]').forEach(f => { io.unobserve(f); start(f); });
  }).observe(document.querySelector('.lec-main'), { subtree: true, attributes: true, attributeFilter: ['class'] });
}

/* ---------------- course home ---------------- */

function home() {
  const p = store.get();
  const cards = [...document.querySelectorAll('.card[data-slug]')];
  cards.forEach(c => {
    const r = p[c.dataset.slug];
    if (r?.done) c.classList.add('done');
    else if (r) c.classList.add('started');
  });
  const btn = document.querySelector('.continue');
  const recent = Object.entries(p).filter(([s]) => cards.some(c => c.dataset.slug === s)).sort((a, b) => (b[1].t || 0) - (a[1].t || 0))[0];
  if (!btn || !recent) return;
  let i = cards.findIndex(c => c.dataset.slug === recent[0]);
  if (recent[1].done) {
    i = cards.findIndex((c, k) => k > i && !c.classList.contains('done'));
    if (i < 0) return;
  }
  const a = cards[i].querySelector('a');
  btn.href = a.getAttribute('href');
  btn.textContent = `Continue: ${cards[i].querySelector('.card-no').textContent}`;
  btn.hidden = false;
}

if (body.classList.contains('dft-home')) home();
else if (body.dataset.slug) lecture(body.dataset.slug);
