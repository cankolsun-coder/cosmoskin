(function () {
  'use strict';

  function loadImage(src, onload) {
    if (!src) return;
    var img = new Image();
    img.onload = function () { onload(src); };
    img.src = src;
  }

  document.querySelectorAll('.cs-guide').forEach(function (guide) {
    var bg = guide.querySelector('.cs-guide-hero__bg[data-guide-bg]');
    if (bg) {
      loadImage(bg.getAttribute('data-guide-bg'), function (src) {
        bg.style.backgroundImage = 'url("' + src + '")';
      });
    }

    guide.querySelectorAll('img[data-guide-src]').forEach(function (img) {
      var customSrc = img.getAttribute('data-guide-src');
      loadImage(customSrc, function (src) {
        img.src = src;
      });
    });
  });
})();
