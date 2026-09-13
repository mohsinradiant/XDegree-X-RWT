/*
  X-Degree scroll/entrance animations.

  ---------------------------------------------------------------------------
  WHY INTERSECTIONOBSERVER AND NOT SCROLLTRIGGER

  The first version drove reveals with GSAP ScrollTrigger `once: true`. That
  leaves the tween paused until the trigger plays it, and when the scroll
  position jumps a long way in a single frame the trigger can pass its start
  AND end in one update, kill itself, and never play the tween. The element
  then stays at opacity 0 forever.

  Measured: scrolling to the bottom and back to the top left 19 elements
  invisible with 20 tweens still paused, and they never recovered.

  That is not a synthetic case. Browsers restore scroll position on
  back-navigation, so a shopper who opens a product and returns would land
  mid-page with the sections above them blank. Anchor links and fast flicks do
  the same thing.

  IntersectionObserver has no such failure mode: it reports every observed
  target on the first callback whether or not it intersects, so elements that
  are already ABOVE the viewport are revealed immediately rather than waiting
  for an entry event that will never come. Nothing here is paused waiting to be
  played by something else.

  ---------------------------------------------------------------------------
  THE NO-FLASH CONTRACT

  Scripts run after first paint, so anything hidden by JS would be visible for
  a frame and then blink out. The initial hidden state lives in CSS
  (xd-responsive.css, section 0b) behind `html.xd-anim`, which an inline script
  in theme.liquid <head> adds before paint.

  So a blocked or broken asset must never be able to leave the page invisible:

    * the head script strips `.xd-anim` after 2.5s unless this file sets
      `.xd-anim-ready`;
    * `revealEverything()` clears the class as soon as GSAP is confirmed, so
      from that moment every animated element is driven by GSAP, not CSS;
    * if GSAP or IntersectionObserver is missing, we bail with everything
      visible.

  The selector list here MUST stay in sync with the `html.xd-anim` block in
  xd-responsive.css. If you animate something new, add it in both places.

  Every animation ends at opacity 1 with the transform cleared, so the settled
  page is pixel-identical to the un-animated design.
*/
(function () {
  'use strict';

  var root = document.documentElement;

  function revealEverything() {
    root.classList.remove('xd-anim');
    root.classList.add('xd-anim-ready');
  }

  // The head script already bailed if reduced motion was set, but the setting
  // can change without a reload.
  var reduceMotion =
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (reduceMotion || !window.gsap || !window.IntersectionObserver) {
    revealEverything();
    return;
  }

  var gsap = window.gsap;

  var EASE = 'power3.out';
  var DUR = 0.75;
  var Y = 26;

  function $(sel, ctx) {
    return Array.prototype.slice.call((ctx || document).querySelectorAll(sel));
  }

  /* ---------------------------------------------------------------------
     Observer plumbing
     --------------------------------------------------------------------- */

  /*
    Element -> LIST of callbacks, not a single callback. More than one group
    legitimately shares a trigger (the why-shop card triggers both its photo
    and its feature rows), and storing one function per element meant the
    second registration silently replaced the first - which left the why-shop
    photo at opacity 0 on every viewport.
  */
  var pending = new WeakMap();

  var observer = new IntersectionObserver(
    function (entries) {
      /*
        Everything that crossed in this callback is played as one batch, and
        each play is told its position in it.

        That is what lets a row of cards keep a stagger while still being
        observed one by one. Observing the ROW and staggering its children is
        the obvious alternative, but a row that is three columns wide on a
        desktop is three stacked cards two screens tall on a phone - so the
        second and third would play while still far below the fold and be
        sitting there, already finished, by the time they were scrolled to.
        Per-element triggers fix that; the batch index gives the desktop case
        its stagger back, because there the whole row does cross together.
      */
      var batch = [];

      entries.forEach(function (entry) {
        // Not intersecting AND still below the fold: leave it for later.
        // `top < 0` means the element is above the viewport - already scrolled
        // past, e.g. restored scroll position - so reveal it straight away.
        if (!entry.isIntersecting && entry.boundingClientRect.top >= 0) return;

        var list = pending.get(entry.target);
        observer.unobserve(entry.target);
        pending.delete(entry.target);
        if (list) batch.push.apply(batch, list);
      });

      batch.forEach(function (play, i) {
        play(i);
      });
    },
    // Negative bottom margin starts the reveal a little before the element is
    // fully in view, so it reads as the page arriving rather than a late pop.
    { root: null, rootMargin: '0px 0px -10% 0px', threshold: 0 }
  );

  function onReveal(trigger, play) {
    if (!trigger || !play) return;
    var list = pending.get(trigger);
    if (list) {
      // Already observed by another group - just add to its queue.
      list.push(play);
      return;
    }
    pending.set(trigger, [play]);
    observer.observe(trigger);
  }

  /* ---------------------------------------------------------------------
     Reveal helpers
     --------------------------------------------------------------------- */

  // Set the hidden state via GSAP before dropping the CSS class, so there is
  // never a frame where the element is neither hidden by CSS nor by GSAP.
  function claim(els) {
    if (els.length) gsap.set(els, { opacity: 0, y: Y });
    return els;
  }

  function play(els, opts) {
    opts = opts || {};
    gsap.to(els, {
      opacity: 1,
      y: 0,
      duration: opts.duration || DUR,
      ease: EASE,
      delay: opts.delay || 0,
      stagger: opts.stagger === undefined ? 0.08 : opts.stagger,
      /*
        Drop the transform once the reveal lands. A residual
        `transform: translate(0px, 0px)` keeps the element on its own
        composited layer, which switches text from subpixel to greyscale
        antialiasing - the settled page would then render subtly differently
        from the un-animated design for no benefit.
      */
      clearProps: 'transform',
    });
  }

  function revealGroup(trigger, els, opts) {
    if (!els.length) return;
    claim(els);
    onReveal(trigger || els[0], function () {
      play(els, opts);
    });
  }

  /*
    One trigger per element, staggered by where it lands in the batch - see the
    note in the observer. This is the right shape for anything that is a row on
    a wide screen and a stack on a narrow one, which is most card grids here.
  */
  function revealEach(els, opts) {
    if (!els.length) return;
    opts = opts || {};
    var step = opts.stagger === undefined ? 0.07 : opts.stagger;
    claim(els);
    els.forEach(function (el) {
      onReveal(el, function (i) {
        play([el], { duration: opts.duration, stagger: 0, delay: (i || 0) * step });
      });
    });
  }

  /*
    Media settles rather than rises. A photograph that slides up reads as a
    layout shift; one that scales the last few per cent reads as coming into
    focus. This is the same move the set-builder and why-shop images already
    make, kept as one helper now that five sections want it.
  */
  function revealMedia(trigger, els, opts) {
    if (!els.length) return;
    opts = opts || {};
    gsap.set(els, { opacity: 0, scale: opts.from || 0.94 });
    onReveal(trigger || els[0], function () {
      gsap.to(els, {
        opacity: 1,
        scale: 1,
        duration: opts.duration || 0.9,
        ease: EASE,
        clearProps: 'transform',
      });
    });
  }

  /* ---------------------------------------------------------------------
     Groups. Keep in sync with the `html.xd-anim` list in CSS.
     --------------------------------------------------------------------- */

  function initHero() {
    // Plays on load, not on scroll - it is already in view.
    // The hero <img> is deliberately untouched: it is the LCP element, and
    // fading it would push Largest Contentful Paint back by the full duration.
    var els = claim($('[data-xd-hero] > *'));
    if (!els.length) return;
    gsap.to(els, {
      opacity: 1,
      y: 0,
      duration: 0.8,
      ease: EASE,
      stagger: 0.09,
      delay: 0.1,
      clearProps: 'transform',
    });
  }

  function initSectionHeads() {
    $('.xd-section-head').forEach(function (head) {
      revealGroup(
        head,
        $('.sub-heading, .all-heading, .xd-section-head__note, .xd-section-head__cta', head)
      );
    });

    $('.section-heading').forEach(function (head) {
      revealGroup(head, $('.sub-heading, .all-heading', head));
    });
  }

  function initProductGrids() {
    $('.xd-product-grid').forEach(function (grid) {
      revealGroup(grid, $('[class*="col-"]', grid), { stagger: 0.07 });
    });
  }

  function initSliders() {
    /*
      The whole track moves as one unit rather than per slide. Swiper owns each
      slide's transform and clones slides in loop mode, so animating them
      individually fights Swiper and double-animates the clones.
    */
    $('.trending-slider, .categories-slider').forEach(function (slider) {
      revealGroup(slider, [slider], { stagger: 0, duration: 0.85 });
    });
  }

  function initSetBuilder() {
    $('.pickleball-card').forEach(function (card) {
      var media = $('.pickleball-card__media', card);
      if (media.length) {
        gsap.set(media, { opacity: 0, scale: 0.92 });
        onReveal(card, function () {
          gsap.to(media, {
            opacity: 1,
            scale: 1,
            duration: 0.9,
            ease: EASE,
            clearProps: 'transform',
          });
        });
      }

      var copy = $('.pickleball-card--widget > *', card);
      if (copy.length) {
        claim(copy);
        // Its own trigger: the card is tall on mobile, so the copy should not
        // start revealing while it is still a screen below the fold.
        onReveal(copy[0].parentNode, function () {
          play(copy, { stagger: 0.07 });
        });
      }
    });
  }

  function initWhyShop() {
    $('.why-shop-widget').forEach(function (widget) {
      var media = $('.why-shop-col--media', widget);
      if (media.length) {
        gsap.set(media, { opacity: 0, scale: 1.06 });
        onReveal(widget, function () {
          gsap.to(media, {
            opacity: 1,
            scale: 1,
            duration: 1,
            ease: EASE,
            clearProps: 'transform',
          });
        });
      }

      revealGroup(widget, $('.why-shop-col--features .why-shop-left-item', widget));

      var stats = $('.why-shop-col--stats .why-shop-left-item', widget);
      if (stats.length) {
        claim(stats);
        onReveal(stats[0].parentNode, function () {
          play(stats);
          stats.forEach(countUp);
        });
      }
    });
  }

  /*
    Stat numerals read "25k+", "600+", "4.9/5" - a number wearing a prefix
    and/or a suffix. Split it, tween only the numeric part, and reassemble on
    every frame so the label never loses its meaning mid-count. Anything that
    does not parse is left alone.
  */
  function countUp(row) {
    var el = row.querySelector('.why-shop-right-number');
    if (!el) return;

    var raw = (el.textContent || '').trim();
    var m = raw.match(/^(\D*?)([\d]+(?:[.,][\d]+)?)(.*)$/);
    if (!m) return;

    var prefix = m[1];
    var numText = m[2].replace(/,/g, '');
    var suffix = m[3];
    var target = parseFloat(numText);
    if (!isFinite(target)) return;

    var dot = numText.indexOf('.');
    var decimals = dot === -1 ? 0 : numText.length - dot - 1;
    var counter = { v: 0 };

    gsap.to(counter, {
      v: target,
      duration: 1.4,
      ease: 'power2.out',
      onUpdate: function () {
        el.textContent = prefix + counter.v.toFixed(decimals) + suffix;
      },
      // Restore the authored string verbatim rather than trusting the
      // reassembly to have reproduced it exactly.
      onComplete: function () {
        el.textContent = raw;
      },
    });
  }

  function initStrips() {
    $('.product-trusted__grid').forEach(function (grid) {
      revealGroup(grid, $('[class*="col-"]', grid), { stagger: 0.06 });
    });

    $('.trust-bar .row').forEach(function (row) {
      revealGroup(row, $('[class*="col-"]', row), { stagger: 0.06 });
    });

    $('.footer__nav-grid').forEach(function (grid) {
      revealGroup(grid, $('[class*="col-"]', grid), { stagger: 0.06 });
    });
  }

  /* ---------------------------------------------------------------------
     Content pages: about, blog, article, FAQ, register, collection, policy
     --------------------------------------------------------------------- */

  /*
    The masthead on About/Blog/FAQ, and the hero's opposite number on those
    pages. Plays on load for the same reason the hero does - it is already in
    view, and waiting for an observer callback to reveal the first thing on the
    page reads as a stutter rather than as an entrance.
  */
  function initInnerBanner() {
    var els = claim($('.inner-banner-content [class*="col-"] > *'));
    if (!els.length) return;
    gsap.to(els, {
      opacity: 1,
      y: 0,
      duration: 0.8,
      ease: EASE,
      stagger: 0.09,
      delay: 0.1,
      clearProps: 'transform',
    });
  }

  /*
    Every selector below is written as a complete, document-level selector and
    is copied verbatim into the `html.xd-anim` list in xd-responsive.css. That
    is deliberate: the two lists have to describe the same set of elements, and
    the only reliable way to keep them describing it is for them to be the same
    strings. Anything hidden by CSS that no group here claims stays invisible
    until the 2.5s failsafe in theme.liquid clears it.
  */
  function initStory() {
    // The eyebrow, heading and body are bare children of their column here
    // rather than wrapped in a .section-heading, so they need their own pass.
    var copy = $('.our-story-section .col-lg-7 > *');
    if (copy.length) revealGroup(copy[0].parentNode, copy, { stagger: 0.09 });

    var mission = $('.our-story-section .col-lg-5 > *');
    if (mission.length) revealGroup(mission[0].parentNode, mission, { duration: 0.85 });
  }

  function initShopCards() {
    $('.xd-shop-cards .row.mb-5').forEach(function (head) {
      revealGroup(head, $('.sub-heading, .all-heading, p, .btn', head));
    });

    revealEach($('.xd-shop-cards .row:not(.mb-5) > [class*="col-"]'), { stagger: 0.09 });
  }

  function initAccordions() {
    revealEach($('.fbf-accordion .accordion-item'), { stagger: 0.06 });
  }

  function initBlog() {
    revealEach($('.blog-listing .row > [class*="col-"]'), { stagger: 0.08 });
    // The reviews pager ([data-xd-pager]) starts hidden and is filled by JS,
    // so it is left out of the reveal.
    revealGroup(null, $('.xd-pager:not([data-xd-pager])'), { stagger: 0 });
  }

  function initArticle() {
    revealMedia(null, $('.blog__media'));

    var body = $('.blog-card__meta-list, .blog-card__body--title, .blog-card__body .xd-rte');
    if (body.length) revealGroup(body[0], body, { stagger: 0.1 });

    // Its own trigger and its own unit: it is a separate card, a long way down
    // a long page, and nothing in it wants to be revealed line by line.
    $('.blog-comments').forEach(function (card) {
      revealGroup(card, [card], { duration: 0.85 });
    });
  }

  function initRegister() {
    revealMedia(null, $('.register-image'), { from: 1.04 });

    // Fields one after another: the form is the whole point of this page, and
    // the stagger walks the eye down it in the order it is to be filled in.
    var form = $('.register-form h4, .register-form .form-group');
    if (form.length) revealGroup(form[0].parentNode, form, { stagger: 0.06 });
  }

  function initCollection() {
    // The collection title is a bare .all-heading rather than a .section-head,
    // so initSectionHeads does not see it.
    var heading = $('.all-product .text-center > .all-heading');
    if (heading.length) revealGroup(heading[0], heading, { stagger: 0 });

    /*
      The tile strip scrolls sideways on a phone, so its later tiles sit
      off-screen horizontally - an observer of their own would be satisfied
      only if the reader swiped, and the strip would look half-empty until
      they did. One trigger on the row, stagger inside it.
    */
    var tiles = $('.all-product .row > .col');
    if (tiles.length) revealGroup(tiles[0].parentNode, tiles, { stagger: 0.07 });

    revealEach($('.bestsellers-slider.row > [class*="col-"]'), { stagger: 0.07 });
  }

  function initPageContent() {
    revealEach($('.privacy-policy-section .row > [class*="col-"]'), { duration: 0.85 });

    // Shopify's own /policies/* pages, which ignore theme templates entirely.
    revealGroup(null, $('.shopify-policy__title'), { stagger: 0 });
    revealGroup(null, $('.shopify-policy__body'), { stagger: 0, duration: 0.85 });
  }

  function initProduct() {
    /*
      The main gallery image is left alone, exactly as the home page hero is:
      it is this page's LCP element, and fading it would push Largest
      Contentful Paint back by the whole duration. The thumbnails and the copy
      beside it carry the entrance instead.
    */
    revealGroup(null, $('.fbf-gallery__thumbs'), { stagger: 0 });

    var info = $(
      '.fbf-info__meta, .fbf-info__title, .fbf-info__tag-line, .fbf-info__price,' +
        ' .fbf-info__label, .fbf-buy-row, .fbf-info__disc, .fbf-trust'
    );
    if (info.length) revealGroup(info[0], info, { stagger: 0.06 });

    $('.product-description-section').forEach(function (band) {
      revealGroup(band, $('.product-tabs__bar, .tab-content', band), { stagger: 0.1 });
    });
  }

  function init() {
    initHero();
    initSectionHeads();
    initProductGrids();
    initSliders();
    initSetBuilder();
    initWhyShop();
    initStrips();

    initInnerBanner();
    initStory();
    initShopCards();
    initAccordions();
    initBlog();
    initArticle();
    initRegister();
    initCollection();
    initPageContent();
    initProduct();

    // Only now is every target under GSAP's control.
    revealEverything();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  /*
    Theme editor: a re-rendered section arrives with fresh DOM that GSAP has
    never seen and that CSS is no longer hiding, so it would simply appear.
    Re-running init on it keeps the editor preview honest.
  */
  document.addEventListener('shopify:section:load', init);
})();
