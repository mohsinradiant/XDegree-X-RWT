/*
  Mobile-only interactive behaviour.

  Currently one component: the "Why shop with X-Degree" feature carousel.

  ---------------------------------------------------------------------------
  WHY NOT SWIPER

  The three feature blocks are a vertical list on desktop and a carousel below
  768px. Swiper needs its own DOM shape (.swiper > .swiper-wrapper >
  .swiper-slide) and its stylesheet styles those class names at every width, so
  using it would mean restructuring the markup on the fly and unpicking it again
  above the breakpoint - with the desktop layout on the line if either half
  went wrong.

  CSS scroll-snap needs no DOM change at all: the carousel is declared entirely
  in xd-responsive.css, the desktop list is untouched, and the track is already
  swipeable before this file loads. This script only layers on the two things
  CSS cannot do - the position dots and the auto-advance - so if it never runs
  the carousel still works.
*/
(function () {
  'use strict';

  var MQ = '(max-width: 767.98px)';
  var DELAY = 3600;
  var RESUME_AFTER = 6000;

  var track = document.querySelector('.why-shop-col--features .why-shop-left');
  if (!track) return;

  var slides = Array.prototype.slice.call(track.querySelectorAll('.why-shop-left-item'));
  if (slides.length < 2) return;

  var mq = window.matchMedia(MQ);
  var reduceMotion =
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var dotsWrap = null;
  var dots = [];
  var timer = null;
  var resumeTimer = null;
  var rafPending = false;
  var visible = true;
  var active = 0;

  /* ------------------------------------------------------------------ */

  function indexFromScroll() {
    var mid = track.getBoundingClientRect();
    var center = mid.left + mid.width / 2;
    var best = 0;
    var bestDistance = Infinity;
    slides.forEach(function (slide, i) {
      var r = slide.getBoundingClientRect();
      var d = Math.abs(r.left + r.width / 2 - center);
      if (d < bestDistance) {
        bestDistance = d;
        best = i;
      }
    });
    return best;
  }

  function paintDots(i) {
    if (i === active) return;
    active = i;
    dots.forEach(function (dot, n) {
      dot.classList.toggle('is-active', n === i);
      dot.setAttribute('aria-selected', n === i ? 'true' : 'false');
    });
  }

  function goTo(i) {
    var slide = slides[i];
    if (!slide) return;
    // Centre the slide in the track. scroll-snap corrects any rounding.
    var left = slide.offsetLeft - (track.clientWidth - slide.offsetWidth) / 2;
    if (track.scrollTo) track.scrollTo({ left: left, behavior: 'smooth' });
    else track.scrollLeft = left;
  }

  function onScroll() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(function () {
      rafPending = false;
      paintDots(indexFromScroll());
    });
  }

  /* ------------------------------------------------------------------ */

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function start() {
    stop();
    // No auto-advance for reduced motion, off-screen, or a hidden tab - the
    // dots and swiping still work, it just will not move on its own.
    if (reduceMotion || !mq.matches || !visible || document.hidden) return;
    timer = setInterval(function () {
      goTo((indexFromScroll() + 1) % slides.length);
    }, DELAY);
  }

  // Any touch or drag hands control to the reader; auto-advance resumes only
  // after they have been still for a while.
  function pauseForUser() {
    stop();
    clearTimeout(resumeTimer);
    resumeTimer = setTimeout(start, RESUME_AFTER);
  }

  /* ------------------------------------------------------------------ */

  function buildDots() {
    if (dotsWrap) return;
    dotsWrap = document.createElement('div');
    dotsWrap.className = 'why-shop-features-dots';
    dotsWrap.setAttribute('role', 'tablist');
    dotsWrap.setAttribute('aria-label', 'Feature slides');

    dots = slides.map(function (slide, i) {
      var dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'why-shop-features-dot';
      dot.setAttribute('role', 'tab');
      dot.setAttribute('aria-label', 'Show feature ' + (i + 1) + ' of ' + slides.length);
      dot.addEventListener('click', function () {
        goTo(i);
        pauseForUser();
      });
      dotsWrap.appendChild(dot);
      return dot;
    });

    track.parentNode.insertBefore(dotsWrap, track.nextSibling);
    active = -1;
    paintDots(indexFromScroll());
  }

  function teardown() {
    stop();
    clearTimeout(resumeTimer);
    if (dotsWrap && dotsWrap.parentNode) dotsWrap.parentNode.removeChild(dotsWrap);
    dotsWrap = null;
    dots = [];
  }

  function apply() {
    if (mq.matches) {
      buildDots();
      start();
    } else {
      // Above the breakpoint the CSS carousel is gone and this is a plain
      // vertical list again, so the dots would be meaningless.
      teardown();
    }
  }

  /* ------------------------------------------------------------------ */

  track.addEventListener('scroll', onScroll, { passive: true });
  ['pointerdown', 'touchstart', 'wheel'].forEach(function (evt) {
    track.addEventListener(evt, pauseForUser, { passive: true });
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stop();
    else start();
  });

  // Do not animate a section nobody is looking at.
  if (window.IntersectionObserver) {
    new IntersectionObserver(
      function (entries) {
        visible = entries[0].isIntersecting;
        if (visible) start();
        else stop();
      },
      { threshold: 0.2 }
    ).observe(track);
  }

  if (mq.addEventListener) mq.addEventListener('change', apply);
  else if (mq.addListener) mq.addListener(apply);

  apply();
})();
