(function () {
  'use strict';

  const section = document.getElementById('bestsellers');
  if (!section) return;

  const ratingFallback = {};

  const reviewSummaryCache = new Map();
  const REVIEW_CACHE_TTL = 5 * 60 * 1000;
  const API_BASE = ((window.COSMOSKIN_CONFIG && window.COSMOSKIN_CONFIG.apiBase) || '/api').replace(/\/$/, '');

  function isLocalStaticPreview() {
    return !window.COSMOSKIN_ENABLE_LOCAL_API && (location.protocol === 'file:' || location.hostname === ['local','host'].join('') || location.hostname === '127.0.0.1');
  }


  const tabProductTags = {
    tumu: ['Yatıştırıcı', 'Denge', 'Hafif', 'Bariyer', 'Günlük'],
    'nem-bariyer': ['Yoğun Nem', 'Bariyer', 'Seramid', 'Hafif', 'Rahatlatıcı', 'Nemlendirici'],
    'gunes-korumasi': ['SPF 50+', 'Günlük Koruma', 'Hafif Doku', 'Beyaz İz Bırakmaz', 'Nemli Bitiş'],
    'akne-denge': ['Yatıştırıcı', 'Denge', 'Gözenek', 'Arındırıcı', 'Sebum Dengesi', 'Nazik Temizlik'],
    isilti: ['Işıltı', 'Besleyici', 'Canlı Görünüm', 'Leke Görünümü', 'Vitamin C', 'Glow'],
    'hassas-cilt': ['Hassas Cilt', 'Nazik Temizlik', 'Yatıştırıcı', 'Bariyer', 'Seramid', 'Denge', 'Alkol İçermez']
  };

  const bestsellerTabs = {
    tumu: {
      label: 'Tümü',
      featuredProduct: 'beauty-of-joseon-relief-sun-spf50',
      featuredBackground: 'assets/img/editorial/beauty-of-joseon-relief-sun-campaign-card.webp',
      featuredVariant: 'campaign',
      editorOverlayCopy: 'Hafif dokulu, beyaz iz bırakmayan günlük güneş koruyucu. Cildi nemlendirir, korur ve rahatlatır.',
      featuredTags: ['SPF 50+', 'Hafif', 'Günlük Kullanım'],
      products: ['beauty-of-joseon-relief-sun-spf50', 'torriden-dive-in-hyaluronic-acid-serum', 'skin1004-madagascar-centella-ampoule', 'dr-jart-ceramidin-cream', 'round-lab-birch-juice-sunscreen', 'cosrx-advanced-snail-96-mucin-essence', 'beauty-of-joseon-glow-serum-propolis-niacinamide', 'anua-heartleaf-pore-control-cleansing-oil']
    },
    'nem-bariyer': {
      label: 'Nem & Bariyer',
      featuredProduct: 'torriden-dive-in-hyaluronic-acid-serum',
      featuredBackground: 'assets/img/editorial/torriden-dive-in-moisture-barrier-campaign-card.webp',
      featuredVariant: 'campaign',
      editorOverlayCopy: 'Düşük moleküllü hyaluronik asit içeren hafif serum. Cilde yoğun nem verir, daha dolgun ve konforlu bir his bırakır.',
      featuredTags: ['Yoğun Nem', 'Hafif', 'Bariyer'],
      products: ['torriden-dive-in-hyaluronic-acid-serum', 'dr-jart-ceramidin-cream', 'skin1004-madagascar-centella-ampoule', 'cosrx-advanced-snail-96-mucin-essence', 'torriden-solid-in-ceramide-cream', 'cosrx-oil-free-ultra-moisturizing-lotion', 'beauty-of-joseon-dynasty-cream', 'round-lab-soybean-nourishing-cream']
    },
    'gunes-korumasi': {
      label: 'Güneş Koruması',
      featuredProduct: 'round-lab-birch-juice-sunscreen',
      featuredBackground: 'assets/img/editorial/round-lab-birch-juice-sunscreen-campaign-card.webp',
      featuredVariant: 'campaign',
      editorOverlayCopy: 'Günlük kullanıma uygun hafif SPF koruması sunar. Cildi nemlendirirken konforlu ve görünmez bir bitiş sağlar.',
      featuredTags: ['SPF 50+', 'Günlük Koruma', 'Hafif Doku'],
      products: ['round-lab-birch-juice-sunscreen', 'beauty-of-joseon-relief-sun-spf50', 'skin1004-hyalu-cica-water-fit-sun-serum', 'isntree-hyaluronic-acid-watery-sun-gel', 'torriden-dive-in-watery-moisture-sun-cream', 'beauty-of-joseon-relief-sun-spf50', 'round-lab-birch-juice-sunscreen', 'skin1004-hyalu-cica-water-fit-sun-serum']
    },
    'akne-denge': {
      label: 'Akne & Denge',
      featuredProduct: 'anua-heartleaf-77-soothing-toner',
      featuredBackground: 'assets/img/editorial/anua-heartleaf-77-soothing-toner-campaign-card.webp',
      featuredVariant: 'campaign',
      editorOverlayCopy: 'Heartleaf içeriğiyle cildi yatıştırmaya ve dengelemeye yardımcı olur. Daha sakin, arınmış ve konforlu bir cilt hissi sunar.',
      featuredTags: ['Yatıştırıcı', 'Denge', 'Arındırıcı'],
      products: ['anua-heartleaf-77-soothing-toner', 'anua-heartleaf-pore-control-cleansing-oil', 'cosrx-salicylic-acid-daily-gentle-cleanser', 'cosrx-aha-bha-clarifying-treatment-toner', 'some-by-mi-aha-bha-miracle-toner', 'medicube-zero-pore-pad', 'skin1004-madagascar-centella-ampoule', 'cosrx-low-ph-good-morning-gel-cleanser']
    },
    isilti: {
      label: 'Işıltı',
      featuredProduct: 'beauty-of-joseon-glow-serum-propolis-niacinamide',
      featuredBackground: 'assets/img/editorial/beauty-of-joseon-glow-serum-campaign-card.webp',
      featuredVariant: 'campaign',
      editorOverlayCopy: 'Propolis ve niacinamide ile cilde daha canlı ve aydınlık bir görünüm kazandırmaya yardımcı olur. Besleyici yapısıyla sağlıklı bir ışıltı hissi verir.',
      featuredTags: ['Işıltı', 'Besleyici', 'Canlı Görünüm'],
      products: ['beauty-of-joseon-glow-serum-propolis-niacinamide', 'goodal-green-tangerine-vitamin-c-serum', 'cosrx-the-vitamin-c-23-serum', 'beauty-of-joseon-glow-deep-serum', 'im-from-rice-toner', 'beauty-of-joseon-dynasty-cream', 'by-wishtrend-pure-vitamin-c-21-5-serum', 'round-lab-soybean-nourishing-cream']
    },
    'hassas-cilt': {
      label: 'Hassas Cilt',
      featuredProduct: 'cosrx-low-ph-good-morning-gel-cleanser',
      featuredBackground: 'assets/img/editorial/cosrx-low-ph-good-morning-gel-cleanser-campaign-card.webp',
      featuredVariant: 'campaign',
      editorOverlayCopy: 'Düşük pH’lı nazik jel temizleyici. Cildi germeden arındırır, temiz ve dengeli bir his bırakır.',
      featuredTags: ['Hassas Cilt', 'Nazik Temizlik', 'Düşük pH'],
      products: ['cosrx-low-ph-good-morning-gel-cleanser', 'anua-heartleaf-77-soothing-toner', 'skin1004-madagascar-centella-ampoule', 'dr-jart-ceramidin-cream', 'torriden-dive-in-hyaluronic-acid-serum', 'cosrx-advanced-snail-96-mucin-essence', 'round-lab-1025-dokdo-cleanser', 'round-lab-dokdo-toner']
    }
  };

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const formatPrice = (value) => window.COSMOSKIN_FORMAT_PRICE ? window.COSMOSKIN_FORMAT_PRICE(value) : new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(Number(value || 0));
  const priceDisplayHtml = (product, options) => {
    const PD = window.COSMOSKIN_PRICE_DISPLAY;
    if (PD && typeof PD.renderPriceHtml === 'function') return PD.renderPriceHtml(product, options);
    return `<span class="cs-price cs-price--compact"><span class="cs-price__current">${esc(formatPrice(product.price))}</span></span>`;
  };
  const getProduct = (slug) => {
    const helpers = window.COSMOSKIN_PRODUCT_HELPERS;
    if (helpers && typeof helpers.getProductBySlug === 'function') return helpers.getProductBySlug(slug);
    return (window.COSMOSKIN_PRODUCTS || []).find((product) => product.slug === slug || product.id === slug) || null;
  };
  const bagIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 9.5h9l.7 9.5H6.8l.7-9.5Z" stroke-width="1.7" stroke-linejoin="round"></path><path d="M9 9.5V7a3 3 0 0 1 6 0v2.5" stroke-width="1.7" stroke-linecap="round"></path></svg>';
  const heartIcon = '<span class="favorite-btn-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12.1 20.3 4.9 13.4a4.8 4.8 0 0 1 6.8-6.8l.3.3.3-.3a4.8 4.8 0 1 1 6.8 6.8l-7.2 6.9a.6.6 0 0 1-.8 0Z" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path></svg></span>';

  function readNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function deriveRatingFromProduct(product) {
    if (!product) return { avg: 0, count: 0 };
    const count = readNumber(product.reviewCount ?? product.review_count ?? product.reviewsCount ?? product.reviews_count ?? product.approved_count);
    const avg = readNumber(product.rating ?? product.avgRating ?? product.avg_rating ?? product.ratingValue ?? product.rating_value);
    if (count > 0 && avg > 0) {
      return { avg: Math.round(Math.min(5, Math.max(0, avg)) * 10) / 10, count: Math.round(count) };
    }
    return { avg: 0, count: 0 };
  }

  function normalizeSummary(summary) {
    const count = readNumber(summary && (summary.approved_count ?? summary.total_count ?? summary.reviewCount ?? summary.review_count));
    const avg = readNumber(summary && (summary.avg_rating ?? summary.avgRating ?? summary.rating));
    if (count > 0 && avg > 0) {
      return { avg: Math.round(Math.min(5, Math.max(0, avg)) * 10) / 10, count: Math.round(count) };
    }
    return { avg: 0, count: 0 };
  }

  function cacheKey(slug) {
    return 'cosmoskin_review_summary_' + slug;
  }

  function readCachedSummary(slug) {
    try {
      const raw = sessionStorage.getItem(cacheKey(slug));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || Date.now() - Number(parsed.ts || 0) > REVIEW_CACHE_TTL) return null;
      return parsed.summary || null;
    } catch (_error) {
      return null;
    }
  }

  function writeCachedSummary(slug, summary) {
    try {
      sessionStorage.setItem(cacheKey(slug), JSON.stringify({ ts: Date.now(), summary: summary || {} }));
    } catch (_error) {
      /* no-op */
    }
  }

  async function fetchReviewSummary(slug) {
    if (!slug || typeof fetch !== 'function' || isLocalStaticPreview()) return null;
    if (reviewSummaryCache.has(slug)) return reviewSummaryCache.get(slug);
    const cached = readCachedSummary(slug);
    if (cached) {
      reviewSummaryCache.set(slug, cached);
      return cached;
    }
    try {
      const response = await fetch(`${API_BASE}/reviews?product_slug=${encodeURIComponent(slug)}`, { credentials: 'same-origin' });
      if (!response.ok) return null;
      const data = await response.json().catch(() => ({}));
      const summary = data && data.summary ? data.summary : null;
      if (summary) {
        reviewSummaryCache.set(slug, summary);
        writeCachedSummary(slug, summary);
      }
      return summary;
    } catch (_error) {
      return null;
    }
  }

  function getRating(product) {
    if (!product) return { avg: 0, count: 0 };
    const slug = product.slug || product.id;
    const live = reviewSummaryCache.has(slug) ? normalizeSummary(reviewSummaryCache.get(slug)) : { avg: 0, count: 0 };
    if (live.count > 0 && live.avg > 0) return live;
    const fromProduct = deriveRatingFromProduct(product);
    if (fromProduct.count > 0 && fromProduct.avg > 0) return fromProduct;
    return { avg: 0, count: 0 };
  }

  function buildStars(avg) {
    const safe = Math.max(0, Math.min(5, Number(avg || 0)));
    return [1, 2, 3, 4, 5].map((n) => {
      const fill = Math.max(0, Math.min(100, (safe - (n - 1)) * 100));
      return `<span class="bestseller-rating-star" style="--fill:${fill}%" aria-hidden="true"><span class="bestseller-rating-star__base">★</span><span class="bestseller-rating-star__fill">★</span></span>`;
    }).join('');
  }

  function formatReviewCount(count) {
    return `${Number(count || 0).toLocaleString('tr-TR')} yorum`;
  }

  function tagHtml(tags) {
    return (tags || []).slice(0, 3).map((tag) => `<span class="bestseller-tag">${esc(tag)}</span>`).join('');
  }

  function ratingInnerHtml(rating) {
    return `<span class="bestseller-rating__stars" aria-hidden="true">${buildStars(rating.avg)}</span><strong>${esc(rating.avg.toFixed(1))}</strong><span>· ${esc(formatReviewCount(rating.count))}</span>`;
  }

  function ratingHtml(product) {
    const rating = getRating(product);
    const slug = esc(product.slug || product.id || '');
    if (!(rating.count > 0 && rating.avg > 0)) {
      // No rating yet — render an empty placeholder that holds the same row height
      // and that hydrateReviewSummaries can later upgrade in place. No filler text.
      return `<span class="bestseller-rating bestseller-rating--empty" data-rating-slug="${slug}" aria-hidden="true"></span>`;
    }
    return `<a class="bestseller-rating" data-rating-slug="${slug}" href="${esc(product.url)}#reviewsSection" aria-label="${esc(rating.avg.toFixed(1))} puan, ${esc(formatReviewCount(rating.count))}">${ratingInnerHtml(rating)}</a>`;
  }

  function isMobileBestsellers() {
    return window.matchMedia ? window.matchMedia('(max-width: 767px)').matches : window.innerWidth <= 767;
  }

  function productCard(slug, tabKey, index) {
    const product = getProduct(slug);
    if (!product) return '';
    const tagSet = tabProductTags[tabKey] || tabProductTags.tumu;
    const tags = [tagSet[index % tagSet.length], tagSet[(index + 1) % tagSet.length]].filter(Boolean);
    return `<article class="product-card cs-product-card bestseller-card" data-product-id="${esc(product.id || product.slug)}">
      <div class="product-media-wrap">
        <a class="product-media" href="${esc(product.url)}" aria-label="${esc(product.name)} ürününü incele">
          <img src="${esc(product.image)}" alt="${esc(product.brand + ' ' + product.name)}" loading="lazy">
        </a>
        <button class="favorite-btn bestseller-card__favorite" type="button" aria-label="Favorilere ekle" aria-pressed="false" data-favorite-id="${esc(product.id || product.slug)}" data-name="${esc(product.name)}" data-brand="${esc(product.brand)}" data-price="${esc(product.price)}" data-image="${esc(product.image)}" data-url="${esc(product.url)}">${heartIcon}</button>
      </div>
      <div class="bestseller-card__body product-body">
        <div class="brandline">${esc(product.brand)}</div>
        <a href="${esc(product.url)}"><h3>${esc(product.name)}</h3></a>
        ${ratingHtml(product)}
        <div class="bestseller-card__tags">${tagHtml(tags)}</div>
        <div class="bestseller-card__price-row">
          <div class="bestseller-card__price-block">
            <div class="price">${priceDisplayHtml(product, { compact: true })}</div>
            <div class="bestseller-tax price-note">KDV dahil</div>
          </div>
        </div>
        <div class="bestseller-card__cta-row">
          <p class="bestseller-stock-note bestseller-stock-note--checking">Stok bilgisi güncelleniyor</p>
          <p class="bestseller-stock-note bestseller-stock-note--out">Stokta yok</p>
          <button class="bestseller-btn bestseller-btn--full" type="button" data-add-cart="" data-id="${esc(product.id || product.slug)}" data-slug="${esc(product.slug)}" data-name="${esc(product.name)}" data-brand="${esc(product.brand)}" data-price="${esc(product.price)}" data-image="${esc(product.image)}" data-url="${esc(product.url)}">${bagIcon}<span>Sepete Ekle</span></button>
          <a class="bestseller-btn bestseller-btn--inspect" href="${esc(product.url)}">Ürünü İncele</a>
        </div>
      </div>
    </article>`;
  }

  function updateRatingNodes(container, slug, rating) {
    if (!container || !slug || !rating || !(rating.count > 0 && rating.avg > 0)) return;
    const nodes = container.querySelectorAll(`[data-rating-slug="${slug}"]`);
    nodes.forEach((node) => {
      const href = node.getAttribute('href') || `${(window.COSMOSKIN_PRODUCT_HELPERS?.getProductBySlug?.(slug)?.url) || '#'}#reviewsSection`;
      const link = document.createElement('a');
      link.className = node.className.replace('bestseller-rating--empty','').trim();
      link.setAttribute('data-rating-slug', slug);
      link.setAttribute('href', href);
      link.setAttribute('aria-label', `${rating.avg.toFixed(1)} puan, ${formatReviewCount(rating.count)}`);
      link.innerHTML = ratingInnerHtml(rating);
      node.replaceWith(link);
    });
  }

  async function hydrateReviewSummaries(container) {
    if (!container) return;
    const slugs = Array.from(new Set(Array.from(container.querySelectorAll('[data-rating-slug]')).map((node) => node.getAttribute('data-rating-slug')).filter(Boolean)));
    await Promise.all(slugs.map(async (slug) => {
      const summary = normalizeSummary(await fetchReviewSummary(slug));
      if (summary.count > 0 && summary.avg > 0) {
        reviewSummaryCache.set(slug, summary);
        updateRatingNodes(container, slug, summary);
      }
    }));
  }

  let currentTab = 'tumu';

  function render(tabKey) {
    currentTab = tabKey || currentTab || 'tumu';
    const tab = bestsellerTabs[currentTab] || bestsellerTabs.tumu;
    const featured = getProduct(tab.featuredProduct);
    if (!featured) return;
    const featuredNode = section.querySelector('[data-bestseller-featured]');
    const gridNode = section.querySelector('[data-bestseller-grid]');
    const shell = section.querySelector('[data-bestseller-shell]');
    if (!featuredNode || !gridNode) return;
    section.querySelectorAll('[data-bestseller-tab]').forEach((button) => {
      const active = button.dataset.bestsellerTab === currentTab;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    shell && shell.classList.add('is-switching');
    window.setTimeout(() => {
      featuredNode.style.setProperty('--editorial-bg', `url('/${tab.featuredBackground.replace(/^\//, '')}')`);
      const featuredVariant = tab.featuredVariant || 'default';
      featuredNode.dataset.bestsellerVariant = featuredVariant;
      featuredNode.classList.toggle('bestseller-featured--campaign', featuredVariant === 'campaign');
      featuredNode.innerHTML = `<div class="bestseller-featured__content" data-product-id="${esc(featured.id || featured.slug)}">
        <span class="bestseller-featured__badge"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.65 5.37 5.93.86-4.29 4.18 1.01 5.9L12 16.33 6.7 19.1l1.01-5.9-4.29-4.18 5.93-.86L12 2.8Z"></path></svg> Editör Önerisi</span>
        <div class="bestseller-featured__stage">
          <div class="bestseller-featured__plinth" aria-hidden="true"></div>
          <img class="bestseller-featured__image" src="${esc(featured.image)}" alt="${esc(featured.brand + ' ' + featured.name)}" loading="lazy">
          <div class="bestseller-featured__copy">
            <span class="bestseller-featured__brand brandline">${esc(featured.brand)}</span>
            <a href="${esc(featured.url)}"><h3>${esc(featured.name)}</h3></a>
            <p>${esc(tab.editorOverlayCopy)}</p>
          </div>
        </div>
        <div class="bestseller-featured__footer product-body">
          ${ratingHtml(featured)}
          <div class="bestseller-tags">${tagHtml(tab.featuredTags)}</div>
          <div class="bestseller-meta-row price-row">
            <div><div class="bestseller-price price">${priceDisplayHtml(featured, { compact: true })}</div><div class="bestseller-tax price-note">KDV dahil</div></div>
          </div>
          <div class="bestseller-actions">
            <button class="bestseller-btn" type="button" data-add-cart="" data-id="${esc(featured.id || featured.slug)}" data-slug="${esc(featured.slug)}" data-name="${esc(featured.name)}" data-brand="${esc(featured.brand)}" data-price="${esc(featured.price)}" data-image="${esc(featured.image)}" data-url="${esc(featured.url)}">${bagIcon}<span>Sepete Ekle</span></button>
            <a class="bestseller-btn bestseller-btn--secondary" href="${esc(featured.url)}">${isMobileBestsellers() ? 'İncele' : 'Ürünü İncele'}</a>
          </div>
        </div>
      </div>`;
      const gridSlugs = isMobileBestsellers()
        ? tab.products.filter((slug) => slug !== tab.featuredProduct).slice(0, 4)
        : tab.products;
      gridNode.innerHTML = gridSlugs.map((productSlug, index) => productCard(productSlug, currentTab, index)).join('');
      if (typeof window.initCartButtons === 'function') window.initCartButtons(section);
      if (typeof window.initFavoriteButtons === 'function') window.initFavoriteButtons(section);
      hydrateReviewSummaries(section);
      document.dispatchEvent(new CustomEvent('cosmoskin:bestsellers-rendered', { detail: { tab: currentTab } }));
      if (window.COSMOSKIN_STOCK && typeof window.COSMOSKIN_STOCK.loadInventory === 'function') {
        window.COSMOSKIN_STOCK.loadInventory([featured.slug, ...gridSlugs].filter(Boolean));
      }
      window.setTimeout(() => shell && shell.classList.remove('is-switching'), 40);
    }, 120);
  }

  function init() {
    section.querySelectorAll('[data-bestseller-tab]').forEach((button) => {
      button.addEventListener('click', () => render(button.dataset.bestsellerTab || 'tumu'));
    });
    render('tumu');
    document.addEventListener('cosmoskin:products-updated', () => {
      render(currentTab);
    });
    if (window.matchMedia) {
      const mobileQuery = window.matchMedia('(max-width: 767px)');
      const onBreakpointChange = () => render(currentTab);
      if (typeof mobileQuery.addEventListener === 'function') {
        mobileQuery.addEventListener('change', onBreakpointChange);
      } else if (typeof mobileQuery.addListener === 'function') {
        mobileQuery.addListener(onBreakpointChange);
      }
    }
  }

  const ready = window.COSMOSKIN_PRODUCTS_READY || Promise.resolve(window.COSMOSKIN_PRODUCTS || []);
  ready.then(init).catch(init);
})();
