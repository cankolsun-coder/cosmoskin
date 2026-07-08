### Context
**Completed commits**
- **P1 audit plan**: `c0099ae`
- **P1A drift guard**: `195bda9`
- **P1B read-only admin price visibility**: `e85160d`
- **P1C admin product price editing**: `d4753a7`
- **P1C2 effective price across commerce**: `5737e1d`
- **P1C3 fallback hardening**: `2694207`
- **P1C4 live PDP runtime fix**: `5ca5bb4`
- **P1D admin audit history**: `e916258`

**Hard rule**
- **Do not deploy Cloudflare Pages before the P1C migration is applied in Supabase production.**

---

## SECTION 1 — Migration readiness (Supabase)
### Required production migration
- `supabase/migrations/20260707_p1c_admin_product_price_editing.sql`

### What it must create/support
- **Tables**
  - `public.product_price_overrides`
  - `public.product_price_audit_logs`
- **Indexes**
  - `product_price_overrides_product_slug_uidx` (unique on `product_slug`)
  - `product_price_audit_logs_slug_changed_at_idx` (on `(product_slug, changed_at desc)`)
- **Constraints**
  - `product_price_overrides_regular_price_try_check` (regular_price_try > 0)
  - `product_price_overrides_currency_check` (currency in ('TRY'))
- **Audit fields present**
  - `product_slug`, `old_regular_price_try`, `new_regular_price_try`, `old_currency`, `new_currency`, `changed_by_admin`, `changed_at`, `reason`, `source`, `request_id`
- **Non-destructive**
  - `create table if not exists`
  - `create index if not exists`
  - No drops of existing commerce tables

### Post-migration verification SQL (run in Supabase prod after applying migration)
- **Tables exist**

```sql
select table_schema, table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('product_price_overrides', 'product_price_audit_logs');
```

- **Overrides unique constraint/index exists**

```sql
select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'product_price_overrides'
  and indexname = 'product_price_overrides_product_slug_uidx';
```

- **Overrides constraints exist**

```sql
select conname, pg_get_constraintdef(oid) as def
from pg_constraint
where conrelid = 'public.product_price_overrides'::regclass
  and contype = 'c'
order by conname;
```

- **Audit table columns exist**

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema='public'
  and table_name='product_price_audit_logs'
order by ordinal_position;
```

- **Audit index exists**

```sql
select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'product_price_audit_logs'
  and indexname = 'product_price_audit_logs_slug_changed_at_idx';
```

- **Sanity: can insert + read a log row (optional, if allowed in prod)**
  - Prefer doing this via the admin UI price change instead of manual SQL.

---

## SECTION 2 — Deploy order (exact)
1. **Apply the P1C migration** in Supabase production  
   `20260707_p1c_admin_product_price_editing.sql`
2. **Run the SQL verification queries** above and confirm tables/constraints/indexes exist.
3. **Deploy Cloudflare Pages** with latest commit including P1D (`e916258`).
4. **Hard refresh** admin + storefront in browser (to clear cached JS/HTML).
5. **Smoke-test admin pricing** (Section 3).
6. **Smoke-test storefront pricing parity** (Section 4).
7. **Smoke-test checkout/payment invariants** (Section 5).
8. **Smoke-test audit history** (admin history UI + endpoint) (Sections 3 + 8).

**Do not deploy Pages before step 1 is complete.**

---

## SECTION 3 — Admin smoke tests (BOJ fixture)
**Product**
- Name: Beauty of Joseon Relief Sun SPF50  
- Slug: `beauty-of-joseon-relief-sun-spf50`  
- Test price: **1099 TRY**

### Tests
- **Admin access**
  - Admin products page loads (`admin/products.html`)
  - Product row loads and shows catalog/effective price fields
- **Permission separation**
  - Admin with `products:read` **can view** history
  - Admin without `products:pricing:update` **cannot edit** price (no save action available / blocked message)
  - Admin with `products:pricing:update` **can** edit price
  - Admin with `inventory:adjust` only **cannot** change price
- **Input validation**
  - Reject missing/0/negative/decimal price
  - Accept integer TRY (e.g. 1099)
- **Inventory isolation**
  - Inventory PATCH does **not** accept price fields (expect rejection)
- **Audit write + history**
  - After successful price update to 1099:
    - Audit log row exists in `product_price_audit_logs`
    - “Fiyat Geçmişi” shows **₺899 → ₺1.099**
    - `changed_by_admin` visible
    - `reason` visible if provided

---

## SECTION 4 — Customer storefront smoke tests (after override=1099)
Verify **all customer-facing prices converge to 1099** (allow brief first paint staleness, but it must settle).

- **PDP**
  - Main price: **₺1.099** (`.pdp5-price`)
  - Sticky/mobile price: **₺1.099** (`.mobile-sticky-pdp__copy strong`)
  - Add-to-cart payload: `data-price="1099"` on PDP buttons
  - JSON-LD Offer price becomes `1099` (DOM-inspect after load)
- **PLP / product cards**
  - Category cards show **₺1.099**
- **Search**
  - Search results show **₺1.099**
- **Favorites**
  - Favorites list shows **₺1.099**
- **Bestsellers**
  - BOJ card shows **₺1.099** after products update
- **Routine / smart routine**
  - Routine cards show **₺1.099**, add-to-cart does not preserve stale 899
- **Cart**
  - Cart line price: **₺1.099**
  - Cart subtotal reflects **₺1.099**
  - Free shipping progress reflects **₺1.099**
- **Checkout UI**
  - Checkout summary reflects **₺1.099**

---

## SECTION 5 — Checkout/payment smoke tests
- **Client price tamper-proofing**
  - Even if localStorage/cart contains `899`, checkout charges effective server price
- **Server trusted effective pricing**
  - Checkout uses effective price resolver (override > static)
  - Coupon subtotal uses **1099**
  - Iyzico basket amount uses **1099**
- **Persistence**
  - `order_items.unit_price` is **1099**
  - D3A paid snapshot fields reflect the paid effective price
- **Inventory lifecycle**
  - Stock reservation works
  - Payment success decrements stock
  - Payment failure/expiry releases stock

---

## SECTION 6 — Historical order safety
After override to 1099:
- Old orders remain unchanged
- Admin order detail shows historical paid price
- Customer account order detail shows historical paid price
- Return/refund calculations use **paid snapshots**, not current override
- Audit history does not mutate historical order prices

---

## SECTION 7 — Rollback plan
### A) Frontend/API deploy issue
- Roll back Cloudflare Pages to previous known-good deployment (pre-P1D or pre-P1C4 depending on symptom)
- Re-test Sections 3–6

### B) Price override issue
- Use admin to restore previous price or deactivate override (if supported in admin workflow)
- Verify a new audit log row is written and parity restored

### C) Migration issue
- **Do not drop tables casually**
- Prefer disabling usage by rolling back Pages deploy first
- Only introduce SQL rollback if absolutely required and pre-reviewed

### D) Cache issue
- Hard refresh browser (admin + storefront)
- Purge Cloudflare cache if needed
- Confirm `/api/catalog/effective-prices` is `no-store`

---

## SECTION 8 — Final go/no-go checklist
- [ ] Working tree clean except `.wrangler/`
- [ ] Latest commit includes P1D (`e916258`)
- [ ] P1C migration applied in production
- [ ] Supabase verification SQL passed
- [ ] Pages deploy completed after migration
- [ ] Admin price update passed (1099 TRY, integer validation)
- [ ] Storefront parity passed (PDP/PLP/search/favorites/bestsellers/routine/cart/checkout)
- [ ] Audit history passed (API + UI)
- [ ] Checkout/payment amount passed (server trusted)
- [ ] Stock lifecycle passed
- [ ] Historical order/refund safety passed

