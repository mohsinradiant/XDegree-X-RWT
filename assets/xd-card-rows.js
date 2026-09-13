/*
  Lines product cards up within each visual row.

  Cards in one row are already the same height (xd-overrides.css). This makes
  their parts start level too, adding space only where a row needs it:

    * title  - pushed down to the lowest title top in the row, so a card with
               no star rating lines up with a neighbour that has one;
    * title  - given the row's tallest title height, so a one-line name and a
               two-line name put their prices at the same height.

  A row where every card already matches gets nothing, so the design's own
  spacing is untouched. Re-runs on resize, font load and whenever cards are
  added (collection infinite scroll, filter changes).
*/
(function () {
  var GRIDS = '.bestsellers-slider.row, .xd-product-grid, .trending-slider .swiper-wrapper';
  var queued = false;

  function cardsIn(grid) {
    return Array.prototype.slice.call(grid.querySelectorAll('.product-card')).filter(function (card) {
      return card.querySelector('.product-card-title') && card.getBoundingClientRect().width > 0;
    });
  }

  function alignGrid(grid) {
    var cards = cardsIn(grid);
    if (cards.length < 2) return;

    // 1. Reset, so every measurement below is of the natural layout.
    cards.forEach(function (card) {
      var title = card.querySelector('.product-card-title');
      title.style.removeProperty('margin-top');
      title.style.removeProperty('min-height');
    });

    // 2. Read everything before writing anything.
    var rows = {};
    cards.forEach(function (card) {
      var title = card.querySelector('.product-card-title');
      var cardBox = card.getBoundingClientRect();
      var titleBox = title.getBoundingClientRect();
      var key = Math.round(cardBox.top + window.scrollY);
      (rows[key] = rows[key] || []).push({
        title: title,
        offset: titleBox.top - cardBox.top,
        height: titleBox.height,
        margin: parseFloat(getComputedStyle(title).marginTop) || 0,
      });
    });

    // 3. Write per row.
    Object.keys(rows).forEach(function (key) {
      var row = rows[key];
      if (row.length < 2) return;
      var maxOffset = Math.max.apply(null, row.map(function (c) { return c.offset; }));
      var maxHeight = Math.max.apply(null, row.map(function (c) { return c.height; }));
      row.forEach(function (c) {
        var push = maxOffset - c.offset;
        // !important: the listing title's margin comes from Bootstrap's
        // .my-2, which is itself !important and would beat a plain inline style.
        if (push > 0.5) c.title.style.setProperty('margin-top', c.margin + push + 'px', 'important');
        if (maxHeight - c.height > 0.5) c.title.style.setProperty('min-height', maxHeight + 'px', 'important');
      });
    });
  }

  function alignAll() {
    queued = false;
    document.querySelectorAll(GRIDS).forEach(alignGrid);
  }

  function schedule() {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(alignAll);
  }

  var resizeTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(schedule, 120);
  });
  window.addEventListener('load', schedule);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);

  // Cards arriving later: infinite scroll appends, filtering swaps the grid.
  // Only childList changes are watched; this script writes styles, so it
  // never triggers itself.
  if ('MutationObserver' in window) {
    new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var nodes = mutations[i].addedNodes;
        for (var j = 0; j < nodes.length; j++) {
          var node = nodes[j];
          if (node.nodeType === 1 && (node.matches('.product-card, [class*="col-"], .swiper-slide') || node.querySelector('.product-card'))) {
            schedule();
            return;
          }
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', schedule);
  } else {
    schedule();
  }
})();
