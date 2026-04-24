window.COSMOSKIN_CONFIG = {
  siteUrl: 'https://www.cosmoskin.com.tr',
  supabaseUrl: 'https://nrwimlsqbmuiimkosthb.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5yd2ltbHNxYm11aWlta29zdGhiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2ODI1NzUsImV4cCI6MjA5MTI1ODU3NX0.qrb5GEcvUbMcKJ9jIS3v051DlKV5z3tEyKlSNB8jOXk',
  authCallbackPath: '/auth/callback.html',
  resetPath: '/auth/reset.html',
  apiBase: '/api',
  currency: 'TRY',
  vatRate: 0.20,
  freeShippingThreshold: 2500,
  shippingFee: 119
};

window.__COSMOSKIN_CFG = {
  apiBase: window.COSMOSKIN_CONFIG.apiBase,
  supabaseUrl: window.COSMOSKIN_CONFIG.supabaseUrl,
  supabaseAnonKey: window.COSMOSKIN_CONFIG.supabaseAnonKey
};
