-- ============================================================
-- COSMOSKIN — D1 Schema for Reviews
-- Apply via: wrangler d1 execute <db_name> --file=schema.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS product_reviews (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  product_slug  TEXT    NOT NULL,
  name          TEXT    NOT NULL,
  email         TEXT,
  rating        INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title         TEXT,
  body          TEXT    NOT NULL,
  status        TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  ip_hash       TEXT,
  user_agent    TEXT,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reviews_slug_status ON product_reviews(product_slug, status);
CREATE INDEX IF NOT EXISTS idx_reviews_status      ON product_reviews(status);
CREATE INDEX IF NOT EXISTS idx_reviews_created     ON product_reviews(created_at);
