(function () {
  'use strict';
  document.documentElement.classList.add('js');
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Footer year
  var yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // Header shadow on scroll
  var header = document.querySelector('.site-header');
  function onScroll() { header.classList.toggle('scrolled', window.scrollY > 8); }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Mobile menu
  var toggle = document.querySelector('.menu-toggle');
  var nav = document.getElementById('primary-nav');
  toggle.addEventListener('click', function () {
    var open = nav.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
  });
  nav.addEventListener('click', function (e) {
    if (e.target.tagName === 'A') {
      nav.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    }
  });

  // Scrollspy
  var links = Array.prototype.slice.call(nav.querySelectorAll('a[href^="#"]'));
  if ('IntersectionObserver' in window) {
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        links.forEach(function (l) {
          l.classList.toggle('active', l.getAttribute('href') === '#' + entry.target.id);
        });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    links.forEach(function (l) {
      var sec = document.querySelector(l.getAttribute('href'));
      if (sec) spy.observe(sec);
    });
  }

  // Reveal on scroll
  var revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && !reduceMotion) {
    var revealer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          revealer.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px' });
    revealEls.forEach(function (el) { revealer.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('in'); });
  }

  // Count-up for impact figures
  var counts = document.querySelectorAll('.impact .count');
  function countUp(el) {
    var target = parseInt(el.textContent.replace(/,/g, ''), 10);
    if (!target || reduceMotion) return;
    var start = null, dur = 1400;
    function step(ts) {
      if (start === null) start = ts;
      var t = Math.min((ts - start) / dur, 1);
      var eased = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.round(target * eased).toLocaleString('en-US');
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  if ('IntersectionObserver' in window) {
    var counter = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) { countUp(entry.target); counter.unobserve(entry.target); }
      });
    }, { threshold: 0.6 });
    counts.forEach(function (el) { counter.observe(el); });
  }

  // Publications: filter, search, sort
  var list = document.getElementById('pub-list');
  if (list) {
    var pubs = Array.prototype.slice.call(list.querySelectorAll('.pub'));
    var filters = document.querySelectorAll('.filter');
    var search = document.getElementById('pub-search');
    var sort = document.getElementById('pub-sort');
    var empty = document.getElementById('pub-empty');
    var state = { filter: 'all', q: '', sort: 'date' };

    // Hide filter buttons that would match nothing
    filters.forEach(function (btn) {
      var f = btn.dataset.filter;
      if (f === 'all') return;
      var any = pubs.some(function (p) { return f === 'first' ? p.dataset.first === 'true' : p.dataset.type === f; });
      if (!any) btn.hidden = true;
    });

    function apply() {
      var shown = 0;
      pubs.forEach(function (p) {
        var okType = state.filter === 'all' ||
          (state.filter === 'first' ? p.dataset.first === 'true' : p.dataset.type === state.filter);
        var okQ = !state.q || p.textContent.toLowerCase().indexOf(state.q) !== -1;
        p.hidden = !(okType && okQ);
        if (!p.hidden) shown++;
      });
      empty.hidden = shown > 0;
      var sorted = pubs.slice().sort(function (a, b) {
        if (state.sort === 'cites') {
          var d = (+b.dataset.cites) - (+a.dataset.cites);
          if (d) return d;
        }
        return b.dataset.date.localeCompare(a.dataset.date);
      });
      sorted.forEach(function (p) { list.appendChild(p); });
    }

    filters.forEach(function (btn) {
      btn.addEventListener('click', function () {
        filters.forEach(function (b) { b.classList.remove('is-active'); b.setAttribute('aria-pressed', 'false'); });
        btn.classList.add('is-active');
        btn.setAttribute('aria-pressed', 'true');
        state.filter = btn.dataset.filter;
        apply();
      });
    });
    search.addEventListener('input', function () { state.q = search.value.trim().toLowerCase(); apply(); });
    sort.addEventListener('change', function () { state.sort = sort.value; apply(); });
  }

  // News: show earlier updates
  var newsToggle = document.getElementById('news-toggle');
  var newsList = document.getElementById('news-list');
  if (newsToggle && newsList) {
    if (!newsList.querySelector('.news-more')) newsToggle.hidden = true;
    newsToggle.addEventListener('click', function () {
      var open = newsList.classList.toggle('expanded');
      newsToggle.setAttribute('aria-expanded', String(open));
      newsToggle.textContent = open ? 'Show fewer updates' : 'Show earlier updates';
      if (open) newsList.querySelectorAll('.news-more').forEach(function (el) { el.classList.add('in'); });
    });
  }
})();
