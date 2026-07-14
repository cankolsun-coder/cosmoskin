# COSMOSKIN E4 — Email Preview Runbook

## Render previews (default — nothing is sent, nothing touches the DB)
```bash
node scripts/email-preview.mjs            # all previews -> ./email-previews/*.html (gitignored)
node scripts/email-preview.mjs --list     # names
node scripts/email-preview.mjs --only refund_partial
```
Available: `order_confirmation`, `bank_transfer_pending`, `shipment`, `delivery`,
`refund_full`, `refund_partial`, `invoice_ready`, `back_in_stock`, `back_in_stock_no_image`.

Fixture coverage: regular-price product, sale + compare-at product, very long product name,
missing-image fallback, multi-item order, Turkish characters (Şükran Çağlayan / İade / Görsel).

## Inspect
Open the HTML files in a browser. For client-width checks use DevTools at **360px** and the
native 600px container. The new wordmark asset renders from the production URL once deployed;
before deploy, preview locally (browsers show the alt text "COSMOSKIN" if the asset 404s —
this disappears after the first deploy of `assets/img/email/cosmoskin-wordmark-email-v1.png`).

## Optional: send ONE preview to a test inbox (explicit, allowlisted)
```bash
export BREVO_API_KEY=...                                # never commit/echo
export E4_TEST_EMAIL_ALLOWLIST="you@yourdomain.tld"     # comma-separated allowlist
node scripts/email-preview.mjs --only back_in_stock --send-to you@yourdomain.tld
```
Refusals (by design): missing BREVO key, recipient not in the allowlist, more than one preview
selected. The tool contains no customer/order lookup — a production customer address cannot be
picked accidentally.

## Real-client checklist (Gmail web, Gmail mobile, Apple Mail, Outlook)
- Wordmark PNG loads (dark header) — alt "COSMOSKIN" if images blocked.
- Product images load; framed thumbs keep their 76/120px boxes (no reflow).
- CTA buttons tappable at 360px; no horizontal scroll.
- Turkish characters (İ, ş, ğ, ç) render in subject and body.
- Sale price: current strong, compare-at struck-through and muted.
- Dark-mode: dark header stays dark; ivory body may invert on Gmail — text remains readable
  (inline colors on every element).
- Links carry no tracking params from our side; Brevo click-tracking wrapping is provider-level.

## Regeneration after template changes
Re-run the preview script; commit nothing from `email-previews/` (gitignored). The E4 validator
(`scripts/validate-e4-transactional-email-invoice-refund-brand-integrity.mjs`) re-renders core
templates itself, so CI catches unsafe-src/branding regressions without the preview files.
