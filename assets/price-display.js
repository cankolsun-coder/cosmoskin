(function (root) {
  'use strict';

  function toNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function formatTryPrice(value) {
    const n = toNumber(value);
    if (n == null || n <= 0) return '';
    try {
      return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(n);
    } catch (_error) {
      return '₺' + String(Math.round(n));
    }
  }

  function getPayablePrice(product) {
    const payable = toNumber(product && (product.effective_price_try ?? product.price ?? product.price_try));
    return payable != null && payable > 0 ? payable : 0;
  }

  function shouldShowSalePrice(product) {
    if (!product) return false;
    const mode = String(product.price_display_mode || 'regular');
    if (mode !== 'sale' && !product.sale_active) return false;
    const payable = getPayablePrice(product);
    const sale = toNumber(product.sale_price_try);
    if (sale != null && sale > 0 && payable > 0 && payable < sale) return false;
    if (sale != null && sale > 0 && payable === sale) return true;
    if (product.sale_active && payable > 0) {
      const regular = toNumber(product.regular_price_try ?? product.base_catalog_price_try);
      return regular == null || payable < regular;
    }
    return false;
  }

  function getCompareAtPrice(product) {
    if (!shouldShowSalePrice(product)) return null;
    const payable = getPayablePrice(product);
    const compareAt = toNumber(product.compare_at_price_try);
    if (compareAt != null && compareAt > payable) return compareAt;
    const regular = toNumber(product.regular_price_try ?? product.base_catalog_price_try);
    if (regular != null && regular > payable) return regular;
    return null;
  }

  function getDisplaySalePrice(product) {
    return shouldShowSalePrice(product) ? getPayablePrice(product) : null;
  }

  function getDisplayRegularPrice(product) {
    return getCompareAtPrice(product);
  }

  function getDiscountPercent(product) {
    const compare = getCompareAtPrice(product);
    const payable = getPayablePrice(product);
    if (!compare || !payable || compare <= payable) return null;
    const pct = Math.round((1 - payable / compare) * 100);
    return pct > 0 && pct < 100 ? pct : null;
  }

  function normalizePriceDisplay(product) {
    const payable = getPayablePrice(product);
    const showSale = shouldShowSalePrice(product);
    if (!showSale || payable <= 0) {
      return {
        mode: 'regular',
        payable,
        current: payable,
        compare: null,
        badge: null,
        ariaLabel: payable > 0 ? ('Fiyat ' + formatTryPrice(payable)) : '',
        showSale: false
      };
    }
    const compare = getCompareAtPrice(product);
    const pct = getDiscountPercent(product);
    const badge = pct != null ? ('%' + pct) : 'İndirim';
    const ariaLabel = compare
      ? ('İndirimli fiyat ' + formatTryPrice(payable) + ', önceki fiyat ' + formatTryPrice(compare))
      : ('İndirimli fiyat ' + formatTryPrice(payable));
    return {
      mode: 'sale',
      payable,
      current: payable,
      compare,
      badge,
      ariaLabel,
      showSale: true
    };
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function renderPriceHtml(product, options) {
    options = options || {};
    const model = normalizePriceDisplay(product);
    const compact = Boolean(options.compact);
    const stack = Boolean(options.stack);
    const showBadge = options.showBadge !== false;
    const note = options.note ? String(options.note) : '';
    const multiplier = Math.max(1, Number(options.multiplier || 1));
    const current = model.current * multiplier;
    const compare = model.compare != null ? model.compare * multiplier : null;
    const classes = ['cs-price'];
    if (model.showSale) classes.push('cs-price--sale');
    if (compact) classes.push('cs-price--compact');
    if (stack) classes.push('cs-price--stack');

    let html = '<div class="' + classes.join(' ') + '"';
    if (model.ariaLabel) html += ' aria-label="' + escapeHtml(model.ariaLabel) + '"';
    html += '>';
    html += '<span class="cs-price__current">' + escapeHtml(formatTryPrice(current)) + '</span>';
    if (model.showSale && compare != null) {
      html += '<span class="cs-price__compare" aria-hidden="true">' + escapeHtml(formatTryPrice(compare)) + '</span>';
    }
    if (model.showSale && showBadge && model.badge) {
      html += '<span class="cs-price__badge">' + escapeHtml(model.badge) + '</span>';
    }
    if (note) html += '<span class="cs-price__note">' + escapeHtml(note) + '</span>';
    html += '</div>';
    return html;
  }

  function patchPriceElement(el, product, options) {
    if (!el || !product) return false;
    const html = renderPriceHtml(product, options);
    if (!html) return false;
    el.innerHTML = html;
    el.dataset.priceDisplayApplied = 'true';
    return true;
  }

  const api = {
    formatTryPrice,
    getPayablePrice,
    shouldShowSalePrice,
    getDisplayRegularPrice,
    getDisplaySalePrice,
    getCompareAtPrice,
    getDiscountPercent,
    normalizePriceDisplay,
    renderPriceHtml,
    patchPriceElement
  };

  root.COSMOSKIN_PRICE_DISPLAY = api;
})(typeof window !== 'undefined' ? window : globalThis);
