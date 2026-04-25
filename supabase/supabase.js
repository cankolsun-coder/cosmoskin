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
  url: 'https://nrwimlsqbmuiimkosthb.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5yd2ltbHNxYm11aWlta29zdGhiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2ODI1NzUsImV4cCI6MjA5MTI1ODU3NX0.qrb5GEcvUbMcKJ9jIS3v051DlKV5z3tEyKlSNB8jOXk',
  storageBase: 'https://nrwimlsqbmuiimkosthb.supabase.co/storage/v1/object/public',
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
