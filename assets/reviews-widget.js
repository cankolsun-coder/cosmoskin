/**
 * COSMOSKIN — Deprecated reviews widget bridge
 * /assets/reviews-widget.js
 *
 * Product pages now use /assets/product-page.js as the canonical review UI and API client.
 * This file intentionally avoids booting a second widget or calling legacy endpoints.
 */
(function () {
  'use strict';

  function bridgeActiveReviews() {
    if (typeof window === 'undefined') return;

    if (window.Reviews) {
      window.CosmoReviews = window.Reviews;
      window.COSMOSKIN_LEGACY_REVIEW_WIDGET = {
        deprecated: true,
        activeSystem: 'window.Reviews',
        source: '/assets/product-page.js'
      };

      if (!window.__COSMOSKIN_LEGACY_REVIEW_WIDGET_NOTICE__) {
        window.__COSMOSKIN_LEGACY_REVIEW_WIDGET_NOTICE__ = true;
        console.info('[Reviews] /assets/reviews-widget.js is deprecated. Product pages use /assets/product-page.js.');
      }
      return;
    }

    if (document.querySelector('[data-cs-reviews]')) {
      console.warn('[Reviews] Deprecated reviews widget markup found without /assets/product-page.js. Legacy widget initialization is disabled.');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bridgeActiveReviews, { once: true });
  } else {
    bridgeActiveReviews();
  }
})();
