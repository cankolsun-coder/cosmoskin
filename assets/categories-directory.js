(function () {
  'use strict';

  if (!document.querySelector('.category-directory')) return;

  var MEDIA = {
    cleanse: { img: '/assets/img/cleanse.jpg', icon: '/assets/icons/cosmoskin/routine-step-cleanse.svg' },
    hydrate: { img: '/assets/img/hydrate.jpg', icon: '/assets/icons/cosmoskin/routine-step-prep.svg' },
    treat: { img: '/assets/img/treat.jpg', icon: '/assets/icons/cosmoskin/routine-step-serum.svg' },
    care: { img: '/assets/img/care.jpg', icon: '/assets/icons/cosmoskin/routine-step-moisturize.svg' },
    protect: { img: '/assets/img/protect.jpg', icon: '/assets/icons/cosmoskin/routine-step-spf.svg' },
    masks: { img: '/assets/img/routine.jpg', icon: '/assets/icons/cosmoskin/routine-step-weekly.svg' },
    'kuru-cilt': { icon: '/assets/icons/cosmoskin/routine-goal-hydration.svg' },
    'yagli-cilt': { icon: '/assets/icons/cosmoskin/routine-goal-pore.svg' },
    'karma-cilt': { icon: '/assets/icons/cosmoskin/routine-goal-barrier.svg' },
    'hassas-cilt': { icon: '/assets/icons/cosmoskin/routine-goal-sensitive.svg' },
    'normal-cilt': { icon: '/assets/icons/cosmoskin/routine-goal-radiance.svg' },
    'akneye-egilimli-cilt': { icon: '/assets/icons/cosmoskin/routine-goal-acne-prone.svg' },
    hydration: { icon: '/assets/icons/cosmoskin/routine-goal-hydration.svg' },
    sensitivity: { icon: '/assets/icons/cosmoskin/routine-goal-sensitive.svg' },
    blemish: { icon: '/assets/icons/cosmoskin/routine-goal-tone.svg' },
    'acne-balance': { icon: '/assets/icons/cosmoskin/routine-goal-acne-prone.svg' },
    'pore-sebum': { icon: '/assets/icons/cosmoskin/routine-goal-pore.svg' },
    barrier: { icon: '/assets/icons/cosmoskin/routine-goal-barrier.svg' },
    glow: { icon: '/assets/icons/cosmoskin/routine-goal-radiance.svg' }
  };

  var PRODUCT_CATEGORY = {
    cleanse: 'Temizleyiciler',
    hydrate: 'Tonik & Essence',
    treat: 'Serum & Ampul',
    care: 'Nemlendiriciler',
    protect: 'Güneş Koruyucular',
    masks: 'Maskeler'
  };

  function slugFromHref(href) {
    var match = String(href || '').match(/\/collections\/([^/?#]+)/);
    return match ? match[1] : '';
  }

  function productThumbForCategory(category) {
    var products = window.COSMOSKIN_PRODUCTS || [];
    var item = products.find(function (p) { return p.category === category; });
    return item && item.image ? item.image : '';
  }

  function mediaForSlug(slug) {
    var base = MEDIA[slug] || {};
    var category = PRODUCT_CATEGORY[slug];
    var productImg = category ? productThumbForCategory(category) : '';
    return {
      img: base.img || productImg || '',
      icon: base.icon || '/assets/icons/cosmoskin/system-arrow-right.svg'
    };
  }

  function chevronSvg() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }

  function enhanceCard(card) {
    if (!card || card.dataset.categoryEnhanced === 'true') return;
    var slug = slugFromHref(card.getAttribute('href'));
    if (!slug) return;
    var media = mediaForSlug(slug);
    var title = card.querySelector('strong');
    var desc = card.querySelector('span');
    if (!title) return;

    var mediaEl = document.createElement('span');
    mediaEl.className = 'category-directory-card__media';
    if (media.img) {
      var img = document.createElement('img');
      img.src = media.img;
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      mediaEl.appendChild(img);
    } else {
      mediaEl.classList.add('category-directory-card__media--icon');
      var icon = document.createElement('img');
      icon.src = media.icon;
      icon.alt = '';
      icon.loading = 'lazy';
      icon.decoding = 'async';
      mediaEl.appendChild(icon);
    }

    var body = document.createElement('span');
    body.className = 'category-directory-card__body';
    body.appendChild(title);
    if (desc) body.appendChild(desc);

    var chevron = document.createElement('span');
    chevron.className = 'category-directory-card__chevron';
    chevron.innerHTML = chevronSvg();

    card.textContent = '';
    card.appendChild(mediaEl);
    card.appendChild(body);
    card.appendChild(chevron);
    card.dataset.categoryEnhanced = 'true';
  }

  function init() {
    document.querySelectorAll('.category-directory-card').forEach(enhanceCard);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
