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
    if (e.target.closest('a')) {
      nav.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
      setDd(false);
    }
  });

  // "Learn with me" dropdown: hover opens it on desktop; click, Enter or tap toggles it
  var dd = nav.querySelector('.nav-dd');
  var ddBtn = dd.querySelector('.nav-dd-toggle');
  var hoverNav = window.matchMedia('(hover: hover) and (min-width: 1001px)');
  var ddTimer;
  function setDd(open) {
    clearTimeout(ddTimer);
    dd.classList.toggle('open', open);
    ddBtn.setAttribute('aria-expanded', String(open));
  }
  ddBtn.addEventListener('click', function (e) {
    // A mouse click on desktop keeps the hover-opened menu open instead of closing it.
    setDd(e.detail > 0 && hoverNav.matches ? true : !dd.classList.contains('open'));
  });
  dd.addEventListener('mouseenter', function () { if (hoverNav.matches) setDd(true); });
  dd.addEventListener('mouseleave', function () {
    if (hoverNav.matches) ddTimer = setTimeout(function () { setDd(false); }, 150);
  });
  dd.addEventListener('focusout', function (e) {
    if (!dd.contains(e.relatedTarget) && !dd.matches(':hover')) setDd(false);
  });
  document.addEventListener('click', function (e) { if (!dd.contains(e.target)) setDd(false); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dd.classList.contains('open')) { setDd(false); ddBtn.focus(); }
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
        ddBtn.classList.toggle('active', entry.target.id === 'learn');
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

  // Projects carousel: native horizontal scroll with snap, auto-advances while
  // visible; pauses on hover/focus, when hidden, or via the pause button.
  var carousel = document.getElementById('carousel');
  if (carousel) {
    var track = document.getElementById('car-track');
    var slides = Array.prototype.slice.call(track.querySelectorAll('.slide'));
    var dots = Array.prototype.slice.call(document.querySelectorAll('#car-dots button'));
    var controls = document.querySelector('.carousel-controls');
    var toggleBtn = document.getElementById('car-toggle');
    var DELAY = 7000;
    var current = 0, timer = null, playing = !reduceMotion, held = false, inView = false;
    var pageLoaded = document.readyState === 'complete';
    carousel.style.setProperty('--car-delay', DELAY + 'ms');

    function offsetOf(i) { return slides[i].offsetLeft - slides[0].offsetLeft; }
    function videoOf(i) { return slides[i].querySelector('video'); }

    // span = how long this slide stays (ms); done = how much of it has already played.
    function setActive(i, restartFill, span, done) {
      if (i !== current) {
        var oldV = videoOf(current), newV = videoOf(i);
        if (oldV) oldV.pause();
        if (newV) newV.currentTime = 0;   // a video slide always starts its story from the beginning
      }
      current = i;
      dots.forEach(function (d, k) {
        var on = k === i;
        if (on && span) {
          d.style.setProperty('--car-delay', span + 'ms');
          d.style.setProperty('--car-start', -(done || 0) + 'ms');
        }
        if (on && restartFill) { d.classList.remove('is-active'); void d.offsetWidth; }
        d.classList.toggle('is-active', on);
        if (on) d.setAttribute('aria-current', 'true'); else d.removeAttribute('aria-current');
      });
    }

    function go(i) {
      i = (i + slides.length) % slides.length;
      track.scrollTo({ left: offsetOf(i), behavior: reduceMotion ? 'auto' : 'smooth' });
      setActive(i, false);
      schedule();
    }

    // A slide video plays like a GIF, but only while it is the active slide, the carousel is on
    // screen, rotation is not paused and the page has finished loading. With preload="none" it
    // downloads nothing until then. The pause button stops it too.
    function syncVideo() {
      var v = videoOf(current);
      if (!v) return;
      if (playing && inView && pageLoaded && !document.hidden && !v.blocked) {
        var p = v.play();
        if (p) p.catch(function (e) {
          // Autoplay refused (e.g. iOS Low Power Mode): keep the poster and treat it as an image slide.
          if (e && e.name === 'NotAllowedError') { v.blocked = true; schedule(); }
        });
      } else {
        v.pause();
      }
    }

    function schedule() {
      clearTimeout(timer);
      var run = playing && !held && inView && !document.hidden;
      carousel.classList.toggle('is-running', run);
      syncVideo();
      if (!run) return;
      // An image slide stays DELAY ms. A video slide stays until its 'ended' event; the timer is
      // only a safety net in case the video stalls or never starts.
      var v = videoOf(current), span = DELAY, done = 0, wait = DELAY;
      if (v && !v.blocked && v.duration) {
        span = v.duration * 1000;
        done = v.currentTime * 1000;
        wait = span - done + 2000;
      } else if (v && !v.blocked) {
        wait = DELAY + 2000;   // not started yet; the 'playing' event re-runs schedule()
      }
      setActive(current, true, span, done);
      timer = setTimeout(function () { go(current + 1); }, wait);
    }

    slides.forEach(function (s, k) {
      var v = s.querySelector('video');
      if (!v) return;
      // Re-time the slide and its dot once frames are actually playing (after loading or a stall).
      v.addEventListener('playing', function () { if (k === current) schedule(); });
      v.addEventListener('ended', function () {
        if (k !== current) return;
        if (carousel.classList.contains('is-running')) go(current + 1);
        else { v.currentTime = 0; syncVideo(); }   // rotation held (hover/focus/touch): keep looping
      });
    });
    if (!pageLoaded) window.addEventListener('load', function () { pageLoaded = true; schedule(); });

    // Sync the active dot once scrolling settles (covers swipes and drags).
    var settle = null;
    track.addEventListener('scroll', function () {
      clearTimeout(settle);
      settle = setTimeout(function () {
        var x = track.scrollLeft, best = 0;
        slides.forEach(function (s, k) {
          if (Math.abs(offsetOf(k) - x) < Math.abs(offsetOf(best) - x)) best = k;
        });
        if (best !== current) { setActive(best, false); schedule(); }
      }, 150);
    }, { passive: true });

    dots.forEach(function (d, k) { d.addEventListener('click', function () { go(k); }); });
    document.getElementById('car-prev').addEventListener('click', function () { go(current - 1); });
    document.getElementById('car-next').addEventListener('click', function () { go(current + 1); });
    track.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { e.preventDefault(); go(current + 1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(current - 1); }
    });

    toggleBtn.addEventListener('click', function () {
      playing = !playing;
      controls.classList.toggle('is-paused', !playing);
      toggleBtn.setAttribute('aria-label', playing ? 'Pause automatic rotation' : 'Start automatic rotation');
      schedule();
    });
    if (!playing) {
      controls.classList.add('is-paused');
      toggleBtn.setAttribute('aria-label', 'Start automatic rotation');
    }

    carousel.addEventListener('mouseenter', function () { held = true; schedule(); });
    carousel.addEventListener('mouseleave', function () { held = false; schedule(); });
    carousel.addEventListener('focusin', function () { held = true; schedule(); });
    carousel.addEventListener('focusout', function (e) {
      if (!carousel.contains(e.relatedTarget)) { held = false; schedule(); }
    });
    track.addEventListener('touchstart', function () { held = true; schedule(); }, { passive: true });
    track.addEventListener('touchend', function () {
      setTimeout(function () { held = false; schedule(); }, 4000);
    }, { passive: true });
    document.addEventListener('visibilitychange', schedule);

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        inView = entries[0].isIntersecting;
        schedule();
      }, { threshold: 0.4 }).observe(carousel);
    }
    setActive(0, false);
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
