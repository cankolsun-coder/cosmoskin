window.COSMOSKIN_CONFIG = {
  siteUrl: 'https://www.cosmoskin.com.tr',
  supabaseUrl: 'https://nhrvqpymtvilsfwttnge.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ocnZxcHltdHZpbHNmd3R0bmdlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxMzQ4MTcsImV4cCI6MjA5NzcxMDgxN30.g06tsqd5D2UmGg6XLj5sD5kOUF_gQU28Ki5goFi4ZWk',
  authCallbackPath: '/auth/callback.html',
  resetPath: '/auth/reset.html',
  apiBase: '/api',
  currency: 'TRY',
  vatRate: 0.20,
  freeShippingThreshold: 2500,
  shippingFee: 119,
  checkout: {
    bankTransfer: {
      bankName: '',
      accountName: '',
      iban: '',
      branch: '',
      currency: 'TRY'
    }
  }
};

window.__COSMOSKIN_CFG = {
  apiBase: window.COSMOSKIN_CONFIG.apiBase,
  supabaseUrl: window.COSMOSKIN_CONFIG.supabaseUrl,
  supabaseAnonKey: window.COSMOSKIN_CONFIG.supabaseAnonKey
};
