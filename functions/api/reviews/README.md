# Cosmoskin — Reviews Backend

Production review system on Cloudflare Pages Functions + D1.

## Architecture

```
/functions/api/reviews/
  ├── [[path]].js        ← catch-all route handler
  └── schema.sql         ← D1 schema migration

/admin/reviews/
  └── index.html         ← admin panel (token-based auth)
```

## Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `GET`    | `/api/reviews?product=<slug>`         | public | List approved reviews + average for a product |
| `POST`   | `/api/reviews`                        | public | Submit new review (status auto-set to `pending`) |
| `GET`    | `/api/reviews/admin`                  | admin  | List all reviews (filter via `?status=pending\|approved\|rejected`) |
| `POST`   | `/api/reviews/admin/:id/approve`      | admin  | Approve review |
| `POST`   | `/api/reviews/admin/:id/reject`       | admin  | Reject review |
| `POST`   | `/api/reviews/admin/:id/pending`      | admin  | Move back to pending |
| `DELETE` | `/api/reviews/admin/:id`              | admin  | Permanently delete |

## Setup (one-time)

### 1. Create D1 database
```bash
wrangler d1 create cosmoskin-reviews
```

Copy the returned `database_id` and add to `wrangler.toml`:

```toml
[[d1_databases]]
binding       = "DB"
database_name = "cosmoskin-reviews"
database_id   = "<id-from-step-1>"
```

### 2. Apply schema
```bash
wrangler d1 execute cosmoskin-reviews --file=functions/api/reviews/schema.sql
```

(For production, repeat with `--remote`.)

### 3. Set admin token secret
```bash
wrangler pages secret put ADMIN_TOKEN
```

Choose a long random string (32+ chars). This is the password for `/admin/reviews/`.

### 4. Deploy
Push to your Pages-connected git repo, or:
```bash
wrangler pages deploy .
```

## Schema

```sql
CREATE TABLE product_reviews (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  product_slug  TEXT    NOT NULL,
  name          TEXT    NOT NULL,
  email         TEXT,
  rating        INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title         TEXT,
  body          TEXT    NOT NULL,
  status        TEXT    NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','approved','rejected')),
  ip_hash       TEXT,
  user_agent    TEXT,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
```

## Submit example (frontend)

```js
fetch('/api/reviews', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    product_slug: 'torriden-dive-in-hyaluronic-acid-serum',
    name:   'Ayşe K.',
    email:  'ayse@example.com',
    rating: 5,
    title:  'Mükemmel nem desteği',
    body:   'Cildimde anında fark yarattı...'
  }),
});
```

## Admin panel

Visit `/admin/reviews/` and enter your `ADMIN_TOKEN`. The token is stored in `localStorage` and sent as `X-Admin-Token` header.

For extra security in production, additionally protect `/admin/*` via:
- Cloudflare Access (recommended)
- Or `_headers` rules to require Cloudflare Zero Trust auth
