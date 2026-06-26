(function () {
  'use strict';
  var TARGET = /(hakkimizda|contact|odeme-ve-guvenlik|teslimat-kargo|iade-degisim|mesafeli-satis|on-bilgilendirme|checkout|cart)\.html$|\/legal\//;
  function icon(label) { return '<span aria-hidden="true">' + label + '</span>'; }
  function mount() {
    if (!TARGET.test(location.pathname) || window.matchMedia('(min-width: 769px)').matches) return;
    if (document.querySelector('.cm-bottom-nav')) return;
    var nav = document.createElement('nav');
    nav.className = 'cm-bottom-nav cm-bottom-nav--fallback';
    nav.setAttribute('aria-label', 'Mobil alt navigasyon');
    var items = [['Anasayfa','/index.html','⌂'],['Keşfet','/explore.html','⌕'],['Rutinim','/account/routines/','✦'],['Favoriler','/favorites.html','♡'],['Hesabım','/account/profile.html','○']];
    nav.innerHTML = items.map(function (item) { return '<a href="' + item[1] + '">' + icon(item[2]) + '<span>' + item[0] + '</span></a>'; }).join('');
    document.body.appendChild(nav);
    document.body.style.paddingBottom = 'calc(82px + env(safe-area-inset-bottom,0px))';
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function(){ setTimeout(mount, 350); }); else setTimeout(mount, 350);
})();
