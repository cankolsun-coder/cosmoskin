(function () {
  'use strict';

  if (!document.querySelector('.category-directory')) return;

  var MEDIA = {
    cleanse: { img: '/assets/img/editorial/cosrx-low-ph-good-morning-gel-cleanser-campaign-card.webp', icon: '/assets/icons/cosmoskin/routine-step-cleanse.svg' },
    hydrate: { img: '/assets/img/editorial/anua-heartleaf-77-soothing-toner-campaign-card.webp', icon: '/assets/icons/cosmoskin/routine-step-prep.svg' },
    treat: { img: '/assets/img/editorial/beauty-of-joseon-glow-serum-campaign-card.webp', icon: '/assets/icons/cosmoskin/routine-step-serum.svg' },
    care: { img: '/assets/img/care.jpg', icon: '/assets/icons/cosmoskin/routine-step-moisturize.svg' },
    protect: { img: '/assets/img/editorial/round-lab-birch-juice-sunscreen-campaign-card.webp', icon: '/assets/icons/cosmoskin/routine-step-spf.svg' },
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
    return match ? match[1].replace(/\.html$/i, '') : '';
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
      icon: base.icon || '/assets/icons/cosmoskin/account-routine.svg'
    };
  }

  function groupType(group) {
    var kicker = group && group.querySelector('.category-directory-head .kicker');
    var label = String(kicker ? kicker.textContent : '').toLocaleLowerCase('tr-TR');
    if (label.indexOf('ürün') !== -1) return 'products';
    if (label.indexOf('cilt tipi') !== -1) return 'skin';
    if (label.indexOf('ihtiya') !== -1) return 'concerns';
    return 'ingredients';
  }

  function enhanceCard(card, index, type) {
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
      img.src = media.img + '?v=20260717-category-editorial1';
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.addEventListener('error', function () {
        mediaEl.classList.add('category-directory-card__media--icon');
        img.src = media.icon + '?v=20260717-category-editorial1';
      }, { once: true });
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

    var action = document.createElement('span');
    action.className = 'category-directory-card__action';
    action.textContent = 'Keşfet';
    action.setAttribute('aria-hidden', 'true');

    card.textContent = '';
    card.appendChild(mediaEl);
    card.appendChild(body);
    card.appendChild(action);
    card.dataset.categorySlug = slug;
    card.dataset.categoryIndex = String(index + 1).padStart(2, '0');
    card.dataset.categoryType = type;
    card.dataset.categoryEnhanced = 'true';
  }

  function init() {
    document.querySelectorAll('.category-directory-group').forEach(function (group, groupIndex) {
      var type = groupType(group);
      group.dataset.categoryGroup = type;
      group.style.setProperty('--category-group-index', String(groupIndex + 1).padStart(2, '0'));
      group.querySelectorAll('.category-directory-card').forEach(function (card, index) {
        enhanceCard(card, index, type);
      });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
