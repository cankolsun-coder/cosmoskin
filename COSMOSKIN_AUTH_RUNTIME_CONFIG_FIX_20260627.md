# COSMOSKIN Auth Runtime Config Fix — 2026-06-27

## Issue
The login modal opened correctly, but submitting login showed:

> Giriş sistemi şu anda yapılandırılıyor. Lütfen kısa süre sonra tekrar deneyin.

Root cause: `assets/site-config.js` expected `window.COSMOSKIN_PUBLIC_SUPABASE_ANON_KEY` / `window.COSMOSKIN_CONFIG.supabaseAnonKey` at browser runtime. Cloudflare Pages environment variables are not automatically exposed as browser `window` globals in a static HTML/JS site. Therefore the Supabase auth client initialized with an empty anon key.

## Fix
Added a Cloudflare Pages Function:

- `functions/api/public-config.js`

This endpoint returns a tiny JavaScript runtime config from Cloudflare environment variables and sets:

- `window.COSMOSKIN_CONFIG.supabaseUrl`
- `window.COSMOSKIN_CONFIG.supabaseAnonKey`
- `window.COSMOSKIN_PUBLIC_SUPABASE_ANON_KEY`

Injected this script before `assets/site-config.js` across HTML pages:

```html
<script src="/api/public-config?v=20260627-auth-config"></script>
```

## Required Cloudflare environment variables
Set these in Cloudflare Pages Production environment:

```env
VITE_SUPABASE_URL=https://nhrvqpymtvilsfwttnge.supabase.co
VITE_SUPABASE_ANON_KEY=<Supabase anon public key>
```

The function also accepts fallback names:

```env
SUPABASE_URL=
SUPABASE_ANON_KEY=
COSMOSKIN_SUPABASE_URL=
COSMOSKIN_PUBLIC_SUPABASE_ANON_KEY=
```

## Security note
Only the Supabase anon/public key is exposed to browser runtime. Service role key, payment secrets, DHL key, Brevo key, Cloudflare token, database password, and JWT secrets are not exposed and must remain server-side only.

## Validation performed
- `functions/api/public-config.js` syntax check passed.
- `assets/auth.js` syntax check passed.
- `assets/auth-ui-hotfix.js` syntax check passed.
- Verified `/api/public-config` script is inserted before the first `assets/site-config.js` include.

## Deployment steps
1. Upload/deploy this zip to Cloudflare Pages.
2. Ensure the Production env vars above exist.
3. Retry deployment after setting env vars.
4. Open `https://cosmoskin.com.tr/api/public-config` in browser and verify it contains `supabaseAnonKey` with a non-empty value.
5. Test login from the header profile modal.
