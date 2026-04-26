/**
 * COSMOSKIN — Live Search System v2
 * Fixed: CSS classes (.srch-item), Turkish char highlight, search.html, keywords
 */
'use strict';

const CosmoSearch = (() => {

  const DEBOUNCE_MS = 160;
  const MAX_RESULTS = 8;
  const MIN_QUERY   = 2;

  let _products  = [];
  let _loaded    = false;
  let _timer     = null;
  let _activeIdx = -1;

  function esc(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function _loadProducts() {
    if (_loaded) return;
    if (window.COSMOSKIN_PRODUCTS_READY && typeof window.COSMOSKIN_PRODUCTS_READY.then === 'function') {
      try {
        await window.COSMOSKIN_PRODUCTS_READY;
        _products = (window.COSMOSKIN_PRODUCTS || []).map(p => ({
          slug:     p.slug || p.id,
          name:     p.name,
          brand:    p.brand,
          category: p.category,
          image:    p.image,
          url:      p.url,
          price:    p.price,
          keywords: Array.isArray(p.keywords) ? p.keywords : String(p.keywords || '').split(' '),
        }));
        _loaded = true;
        return;
      } catch (_) {}
    }
    try {
      const res  = await fetch('/products.json', { cache: 'default' });
      if (!res.ok) throw new Error('products.json 404');
      const json = await res.json();
      _products  = json.products || [];
      _loaded    = true;
    } catch (_) {
      _products = (window.COSMOSKIN_PRODUCTS || []).map(p => ({
        slug:     p.id,
        name:     p.name,
        brand:    p.brand,
        category: p.category,
        image:    p.image,
        url:      p.url,
        price:    p.price,
        keywords: (p.keywords || '').split(' '),
      }));
      _loaded = true;
    }
  }

  function _norm(str) {
    return String(str || '')
      .toLowerCase()
      .replace(/ı/g, 'i').replace(/ğ/g, 'g')
      .replace(/ü/g, 'u').replace(/ş/g, 's')
      .replace(/ö/g, 'o').replace(/ç/g, 'c')
      .replace(/İ/g, 'i').replace(/Ğ/g, 'g')
      .replace(/Ü/g, 'u').replace(/Ş/g, 's')
      .replace(/Ö/g, 'o').replace(/Ç/g, 'c')
      .trim();
  }

  function _score(p, q) {
    const nq  = _norm(q);
    const nNm = _norm(p.name);
    const nBr = _norm(p.brand);
    const nCt = _norm(p.category);
    const nKw = (Array.isArray(p.keywords) ? p.keywords : [p.keywords])
                  .map(k => _norm(String(k || ''))).join(' ');

    if (nNm === nq || nBr === nq)  return 100;
    if (nNm.startsWith(nq))        return  90;
    if (nBr.startsWith(nq))        return  85;
    if (nNm.includes(nq))          return  70;
    if (nBr.includes(nq))          return  65;
    if (nCt.includes(nq))          return  50;
    if (nKw.includes(nq))          return  30;

    const words = nq.split(/\s+/).filter(Boolean);
    if (words.length > 1) {
      const all = words.every(w =>
        nNm.includes(w) || nBr.includes(w) || nCt.includes(w) || nKw.includes(w)
      );
      if (all) return 40;
      const some = words.some(w =>
        nNm.includes(w) || nBr.includes(w) || nKw.includes(w)
      );
      if (some) return 20;
    }
    return 0;
  }

  function _search(q) {
    if (!q || q.length < MIN_QUERY) return [];
    return _products
      .map(p => ({ p, s: _score(p, q) }))
      .filter(x => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, MAX_RESULTS)
      .map(x => x.p);
  }

  function _highlight(text, query) {
    const safe = esc(text);
    if (!query) return safe;
    const nQuery = _norm(query);
    const nText  = _norm(text);
    const idx    = nText.indexOf(nQuery);
    if (idx < 0) return safe;
    const before = esc(text.slice(0, idx));
    const match  = esc(text.slice(idx, idx + query.length));
    const after  = esc(text.slice(idx + query.length));
    return before + '<mark>' + match + '</mark>' + after;
  }

  function _resultHtml(results, q) {
    if (!results.length) {
      return '<div class="srch-no-result"><span>&ldquo;' + esc(q) + '&rdquo; i\u00e7in sonu\u00e7 bulunamad\u0131</span></div>';
    }
    return results.map(function(p, i) {
      const hiName  = _highlight(p.name, q);
      const formattedPrice = p.price
        ? (typeof window.COSMOSKIN_FORMAT_PRICE === 'function' ? window.COSMOSKIN_FORMAT_PRICE(p.price) : '\u20ba' + p.price)
        : '';
      const priceStr = formattedPrice ? ' \u00b7 ' + formattedPrice : '';
      return '<a class="srch-item" href="' + esc(p.url) + '" role="option" data-idx="' + i + '" aria-selected="false">' +
        '<img class="srch-item-img" src="' + esc(p.image) + '" alt="" loading="lazy" width="44" height="44" onerror="this.style.opacity=\'.15\'">' +
        '<div class="srch-item-body">' +
          '<span class="srch-item-name">' + hiName + '</span>' +
          '<span class="srch-item-meta">' + esc(p.brand) + ' \u00b7 ' + esc(p.category) + priceStr + '</span>' +
        '</div>' +
      '</a>';
    }).join('');
  }

  function _show(el, html) {
    el.innerHTML = html;
    el.hidden    = false;
    _activeIdx   = -1;
    el.setAttribute('role', 'listbox');
  }

  function _hide(el) {
    el.hidden    = true;
    el.innerHTML = '';
    _activeIdx   = -1;
  }

  function _handleKey(e, input, resultsEl) {
    const items = resultsEl.querySelectorAll('.srch-item');
    if (!items.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      _activeIdx = Math.min(_activeIdx + 1, items.length - 1);
      _setActive(items, _activeIdx);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      _activeIdx = Math.max(_activeIdx - 1, -1);
      _setActive(items, _activeIdx);
    } else if (e.key === 'Enter' && _activeIdx >= 0) {
      e.preventDefault();
      items[_activeIdx] && items[_activeIdx].click();
    } else if (e.key === 'Escape') {
      _hide(resultsEl);
      input.blur();
    }
  }

  function _setActive(items, idx) {
    items.forEach(function(item, i) {
      const active = i === idx;
      item.setAttribute('aria-selected', active);
      item.classList.toggle('srch-item--active', active);
    });
  }

  function _toggleClear(input, btn) {
    if (!btn) return;
    btn.classList.toggle('is-visible', input.value.length > 0);
  }

  function _bindForm(form) {
    const input     = form.querySelector('.site-search-input');
    const resultsEl = form.querySelector('.site-search-results');
    const clearBtn  = form.querySelector('.site-search-clear');
    if (!input || !resultsEl) return;

    input.addEventListener('input', async function() {
      clearTimeout(_timer);
      _toggleClear(input, clearBtn);
      const q = input.value.trim();
      if (q.length < MIN_QUERY) { _hide(resultsEl); return; }
      _timer = setTimeout(async function() {
        await _loadProducts();
        _show(resultsEl, _resultHtml(_search(q), q));
      }, DEBOUNCE_MS);
    });

    input.addEventListener('keydown', function(e) { _handleKey(e, input, resultsEl); });

    if (clearBtn) {
      clearBtn.addEventListener('click', function() {
        input.value = '';
        input.focus();
        _hide(resultsEl);
        _toggleClear(input, clearBtn);
      });
    }

    document.addEventListener('click', function(e) {
      if (!form.contains(e.target)) _hide(resultsEl);
    });

    input.addEventListener('focus', async function() {
      const q = input.value.trim();
      if (q.length >= MIN_QUERY) {
        await _loadProducts();
        _show(resultsEl, _resultHtml(_search(q), q));
      }
    });

    form.addEventListener('submit', function(e) {
      e.preventDefault();
      const q = input.value.trim();
      if (q) location.href = '/search.html?q=' + encodeURIComponent(q);
    });
  }

  function init() {
    document.querySelectorAll('.site-search-form').forEach(_bindForm);
    window.__COSMOSKIN_SEARCH_BOUND = true;
    _loadProducts().catch(function(){});
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { init: init, search: _search, loadProducts: _loadProducts };

})();

window.CosmoSearch = CosmoSearch;
