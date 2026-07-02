(function () {
  'use strict';

  function loadImage(src, onload, onerror) {
    if (!src) { if (onerror) onerror(); return; }
    var img = new Image();
    img.onload = function () { onload(src); };
    img.onerror = function () { if (onerror) onerror(src); };
    img.src = src;
  }

  function safeFallback(kind, type) {
    var map = {
      cleanser: 'cleanser', toner: 'toner', serum: 'serum', moisturizer: 'moisturizer', sunscreen: 'sunscreen', mask: 'mask', spot: 'spot'
    };
    var resolved = map[kind] || 'default';
    return '/assets/img/guide/fallback/' + resolved + (type === 'ingredient' ? '-ingredient-visual.png' : '-guide-bg.webp');
  }

  function enhanceGuideShell(guide) {
    var kind = guide.getAttribute('data-guide-kind') || (guide.className.match(/cs-guide--([a-z-]+)/) || [])[1] || 'default';
    var bg = guide.querySelector('.cs-guide-hero__bg[data-guide-bg]');
    if (bg) {
      var requestedBg = bg.getAttribute('data-guide-bg');
      loadImage(requestedBg, function (src) {
        bg.style.backgroundImage = 'url("' + src + '")';
      }, function () {
        var fallback = safeFallback(kind, 'hero');
        loadImage(fallback, function (src) { bg.style.backgroundImage = 'url("' + src + '")'; });
      });
    }

    guide.querySelectorAll('img[data-guide-src]').forEach(function (img) {
      var customSrc = img.getAttribute('data-guide-src');
      loadImage(customSrc, function (src) {
        img.src = src;
      }, function () {
        var fallback = safeFallback(kind, 'ingredient');
        if (img.src.indexOf('/assets/img/guide/fallback/') === -1) {
          loadImage(fallback, function (src) { img.src = src; });
        }
      });
    });
  }

  document.querySelectorAll('.cs-guide').forEach(enhanceGuideShell);
})();
