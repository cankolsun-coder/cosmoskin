(function () {
  var PUBLIC_ANON =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ocnZxcHltdHZpbHNmd3R0bmdlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxMzQ4MTcsImV4cCI6MjA5NzcxMDgxN30.g06tsqd5D2UmGg6XLj5sD5kOUF_gQU28Ki5goFi4ZWk';

  function nonEmpty(value, fallback) {
    return (typeof value === 'string' && value.trim()) ? value.trim() : fallback;
  }

  var existing = window.COSMOSKIN_CONFIG || {};
  var fromPublic = window.COSMOSKIN_PUBLIC_SUPABASE_ANON_KEY;

  window.COSMOSKIN_CONFIG = Object.assign({
    siteUrl: 'https://www.cosmoskin.com.tr',
    supabaseUrl: 'https://nhrvqpymtvilsfwttnge.supabase.co',
    // Public anon key — safe in browser. Prefer /api/public-config when available.
    supabaseAnonKey: PUBLIC_ANON,
    authCallbackPath: '/auth/callback.html',
    resetPath: '/auth/reset.html',
    apiBase: '/api',
    turnstileSiteKey: '',
    currency: 'TRY',
    vatRate: 0.20,
    shippingFee: 89
  }, existing, {
    brandName: 'COSMOSKIN',
    sellerName: 'ENES CAN KÖKSÜN',
    supportEmail: 'destek@cosmoskin.com.tr',
    partnershipEmail: 'partnership@cosmoskin.com.tr',
    phone: '',
    etbisRegistered: true,
    etbisTrustText: 'ETBİS Kayıtlı E-Ticaret İşletmesi',
    etbisStatement: 'COSMOSKIN, Elektronik Ticaret Bilgi Sistemi üzerinde kayıtlıdır.',
    etbisUrl: 'https://etbis.ticaret.gov.tr/tr/SiteSorgulamaSonuc?siteId=42e611d4-51da-453d-a68a-90cb532f89dd',
    freeShippingThreshold: 2500,
    cargoProviderDisplay: 'DHL',
    paymentMethods: ['iyzico', 'Visa', 'Mastercard', 'Troy', 'Havale/EFT'],
    bankTransferHoldHours: 24
  });

  // Never let an empty public-config / stale merge wipe the anon key.
  window.COSMOSKIN_CONFIG.supabaseAnonKey = nonEmpty(
    fromPublic,
    nonEmpty(window.COSMOSKIN_CONFIG.supabaseAnonKey, PUBLIC_ANON)
  );
  window.COSMOSKIN_CONFIG.supabaseUrl = nonEmpty(
    window.COSMOSKIN_CONFIG.supabaseUrl,
    'https://nhrvqpymtvilsfwttnge.supabase.co'
  );

  if (!window.COSMOSKIN_PUBLIC_SUPABASE_ANON_KEY) {
    window.COSMOSKIN_PUBLIC_SUPABASE_ANON_KEY = window.COSMOSKIN_CONFIG.supabaseAnonKey;
  }

  window.COSMOSKIN_CONFIG.checkout = Object.assign({}, window.COSMOSKIN_CONFIG.checkout || {}, {
    bankTransferHoldHours: 24,
    bankAccountsEndpoint: '/api/payment/bank-accounts'
  });

  window.__COSMOSKIN_CFG = {
    apiBase: window.COSMOSKIN_CONFIG.apiBase,
    supabaseUrl: window.COSMOSKIN_CONFIG.supabaseUrl,
    supabaseAnonKey: window.COSMOSKIN_CONFIG.supabaseAnonKey
  };
})();
