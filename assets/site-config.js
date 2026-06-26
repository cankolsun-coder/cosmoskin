window.COSMOSKIN_CONFIG = Object.assign({
  siteUrl: 'https://www.cosmoskin.com.tr',
  supabaseUrl: 'https://nrwimlsqbmuiimkosthb.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5yd2ltbHNxYm11aWlta29zdGhiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2ODI1NzUsImV4cCI6MjA5MTI1ODU3NX0.qrb5GEcvUbMcKJ9jIS3v051DlKV5z3tEyKlSNB8jOXk',
  authCallbackPath: '/auth/callback.html',
  resetPath: '/auth/reset.html',
  apiBase: '/api',
  turnstileSiteKey: '',
  currency: 'TRY',
  vatRate: 0.20,
  shippingFee: 119
}, window.COSMOSKIN_CONFIG || {}, {
  brandName: 'COSMOSKIN',
  sellerName: 'ENES CAN KÖLSÜN',
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
window.COSMOSKIN_CONFIG.checkout = Object.assign({}, window.COSMOSKIN_CONFIG.checkout || {}, {
  bankTransferHoldHours: 24,
  bankAccountsEndpoint: '/api/payment/bank-accounts'
});
window.__COSMOSKIN_CFG = {
  apiBase: window.COSMOSKIN_CONFIG.apiBase,
  supabaseUrl: window.COSMOSKIN_CONFIG.supabaseUrl,
  supabaseAnonKey: window.COSMOSKIN_CONFIG.supabaseAnonKey
};
