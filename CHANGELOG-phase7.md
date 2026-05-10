# COSMOSKIN Mobile Redesign — Phase 7 Changelog
**Mobile Account Dashboard Professionalization**
`v20260509-phase7`

---

## Overview

Phase 7 rewrote the mobile account dashboard to support proper URL-based tab routing, real localStorage data, full accessibility markup, and consistent navigation links. All 6 account sections were rebuilt with premium empty states and real data sources.

---

## Files Modified

| File | Change |
|------|--------|
| `assets/mobile-redesign.js` | `activeAccountTab()`, `accountPage()`, `accountContent()`, `bindDelegates()` additions |
| `assets/mobile-redesign.css` | Phase 7 CSS additions (account tabs, help links, empty states) |

---

## JavaScript Changes

### `activeAccountTab()` — URL-based routing

Previous implementation relied solely on `#hash`. Phase 7 rewrote it to:
1. Check `?tab=` query parameter first via `new URLSearchParams(window.location.search)`
2. Fall back to `#hash` for backward compat
3. Also check pathname for `/account/orders.html` and `/account/returns.html` dedicated URLs

```javascript
function activeAccountTab() {
  var path = window.location.pathname;
  var params = new URLSearchParams(window.location.search);
  var tab = params.get('tab') || (window.location.hash || '').replace('#', '');
  if (/\/account\/orders\.html$/.test(path)) return 'orders';
  if (/\/account\/returns\.html$/.test(path)) return 'returns';
  // tab === 'orders' | 'favorites' | 'cart' | 'help' | 'returns'
  return tab || 'overview';
}
```

---

### `accountPage()` — tab navigation with accessibility

All 6 tabs now use `?tab=` URL format (not `#hash`):

| Tab key | URL |
|---------|-----|
| `overview` | `/account/profile.html` |
| `orders` | `/account/profile.html?tab=orders` |
| `favorites` | `/account/profile.html?tab=favorites` |
| `cart` | `/account/profile.html?tab=cart` |
| `help` | `/account/profile.html?tab=help` |
| `returns` | `/account/profile.html?tab=returns` |

Each tab link has:
- `aria-current="page"` when active, `aria-current="false"` otherwise
- `data-cm-account-tab="{key}"` for JS intercept

Account content region:
```html
<div class="cm-account-content" aria-live="polite" aria-label="Hesap içeriği">
```

---

### `accountContent()` — all 6 sections rebuilt

| Section | Data source |
|---------|-------------|
| `overview` | Static welcome + real localStorage date checks |
| `orders` | Empty state with real premium copy; real orders to be injected when API available |
| `favorites` | `favoriteList()` → real `localStorage.cosmoskin_favorites` |
| `cart` | `cartContentHtml()` → real `localStorage.cosmoskin_cart` |
| `help` | Real contact links (email + contact form) + FAQ section |
| `returns` | Links to `/iade-degisim.html` + return process info |

---

### `bindDelegates()` additions

**Tab click intercept:**
```javascript
var accountTabLink = target.closest('[data-cm-account-tab]');
if (accountTabLink && getPageType() === 'account') {
  event.preventDefault();
  var newTab = accountTabLink.getAttribute('data-cm-account-tab');
  var tabUrl = newTab === 'overview' ? '/account/profile.html' : '/account/profile.html?tab=' + newTab;
  history.pushState({ cmTab: newTab }, '', tabUrl);
  remount();
  return;
}
```

**`popstate` listener:**
```javascript
window.addEventListener('popstate', function () {
  if (getPageType() === 'account') remount();
});
```

This enables browser back/forward to work correctly across account tab navigation.

---

### URL consistency fixes

- Bottom nav "Favoriler" link: `#favorites` → `?tab=favorites`
- Hamburger menu "Favorilerim" link: `#favorites` → `?tab=favorites`
- Hamburger menu "Yardım" link: `#help` → `?tab=help`
- Hamburger menu "İade" link: `#returns` → `?tab=returns`

---

## CSS Changes

Phase 7 added the following rules (inside the main 768px `@media` block):

| Selector | Description |
|----------|-------------|
| `.cm-logout:focus-visible` | Focus ring on logout button |
| `.cm-account-tabs a[aria-current="page"]` | Active tab: dark background + white text |
| `.cm-account-tabs a:focus-visible` | Focus ring on tab links |
| `.cm-account-card--compact` | Compact padding variant |
| `.cm-empty-state--inline` | Premium inline empty state (used in orders) |
| `.cm-help-links` | Grid layout for help link list |
| `.cm-help-links a` | 44px tap target help link style |
| `.cm-info-list p` | Small info paragraph in account sections |

---

## Verification

| Check | Result |
|-------|--------|
| `node --check mobile-redesign.js` | ✅ Pass |
| CSS 583=583 balanced | ✅ Pass |
| `?tab=` routing works | ✅ |
| `#hash` fallback preserved | ✅ |
| `aria-current="page"` on active tab | ✅ |
| `aria-live="polite"` on content region | ✅ |
| `popstate` listener | ✅ |
| `history.pushState` on tab click | ✅ |
| Favorites tab: real localStorage data | ✅ |
| Cart tab: real localStorage data | ✅ |
| Bottom nav consistent URL | ✅ |
| Hamburger menu consistent URL | ✅ |
