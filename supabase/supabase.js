/**
 * COSMOSKIN — Supabase Client Module
 * /supabase/supabase.js
 *
 * Bu modül yalnızca Node.js/build ortamı için referanstır.
 * Tarayıcıda window.cosmoskinSupabase kullanılır (assets/auth.js tarafından set edilir).
 *
 * Kurulum: /assets/site-config.js içindeki credentials'ları doldurun.
 * Supabase URL ve Anon Key: https://supabase.com/dashboard → Settings → API
 */

// ─── Tarayıcı Uyumlu Import ────────────────────────────────────
// HTML dosyalarında şu şekilde kullanın:
//
//   <script src="/assets/site-config.js"></script>
//   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
//   <script src="/assets/auth.js" type="module"></script>
//
// Ardından window.cosmoskinSupabase üzerinden erişin:
//   const sb = window.cosmoskinSupabase;

// ─── Node.js / ES Module Kullanımı ────────────────────────────
// import { createClient } from '@supabase/supabase-js';
// const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── Konfigürasyon Referansı ───────────────────────────────────
export const SUPABASE_CONFIG = {
  url: process.env.SUPABASE_URL || 'https://nhrvqpymtvilsfwttnge.supabase.co',
  anonKey: process.env.SUPABASE_ANON_KEY || '',
  storageBase: (process.env.SUPABASE_URL || 'https://nhrvqpymtvilsfwttnge.supabase.co') + '/storage/v1/object/public',
  reviewImagesBucket: 'review-images',
  adminEmail: 'cankolsun@cosmoskin.com.tr',
};

// ─── Tablolar ─────────────────────────────────────────────────
export const TABLES = {
  reviews:      'reviews',
  reviewImages: 'review_images',
  reviewHelpful:'review_helpful',
  orders:       'orders',
  orderItems:   'order_items',
  products:     'products',
};

// ─── RPC Fonksiyonları ────────────────────────────────────────
export const RPC = {
  checkPurchase:    'check_purchase',
  getReviewSummary: 'get_review_summary',
};
