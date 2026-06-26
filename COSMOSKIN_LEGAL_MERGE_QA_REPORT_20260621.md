# COSMOSKIN Legal Merge QA Report — 2026-06-21

## Commands run

```bash
find assets functions js -type f -name '*.js' -print0 | xargs -0 -n1 node --check
node --test tests/local-integration.test.mjs
```

## Results

- JS syntax: PASS
- Local integration tests: PASS — 14 tests passed, 0 failed.
- Internal link crawl: PASS for normal static links. Ignored template/runtime values:
  - `{ .ConfirmationURL }` in Supabase email template
  - `${img.public_url}` / `${item.objectUrl}` style runtime template links in review snippets
- Risk scan: Review required. See below.

## Risk scan details

- `legacy info alias` in `README_PHASE2_ORDERS_ADMIN.md`
- `legacy info alias` in `functions/api/_lib/restock-email.js`

## Missing link details

No missing normal internal links found.
