import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizeIban, isValidTurkishIban, validateBankAccount } from '../functions/api/_lib/bank-accounts.js';
import { calculateCouponPreview, onRequestPost as validateCoupon } from '../functions/api/coupons/validate.js';
import { calculateTotalsWithCoupon, getEftReservationMinutes, onRequestPost as createCheckout } from '../functions/api/create-checkout.js';
import { PRICING_SNAPSHOT_VERSION_V2, allocateOrderDiscountSnapshots, buildOrderItemPricingSnapshots } from '../functions/api/_lib/order-pricing-snapshot.js';
import { buildCheckItem, reserveInventoryForOrder, releaseInventoryReservations, convertInventoryReservations, validateCartStock } from '../functions/api/_lib/inventory.js';
import { issueAdminSession, assertAdmin, getVerifiedSessionEmail, resolveCloudflareAccessEmail } from '../functions/api/_lib/admin.js';
import { clearAccessCertsCacheForTests } from '../functions/api/_lib/cloudflare-access-jwt.js';
import { onRequestPatch as adminStatusPatch } from '../functions/api/admin/orders/[id]/status.js';
import { hasAdminPermission } from '../functions/api/_lib/admin-audit.js';
import { onRequestPost as adminUsersPost } from '../functions/api/admin/users.js';
import { onRequestGet as adminOrdersGet, onRequestPatch as adminOrdersPatch } from '../functions/api/admin/orders.js';
import { onRequestGet as adminOrderDetailGet } from '../functions/api/admin/orders/[id].js';
import { onRequestPost as adminOrderEmailsPost } from '../functions/api/admin/orders/[id]/emails.js';
import { onRequestPost as adminOrderShipmentsPost } from '../functions/api/admin/orders/[id]/shipments.js';
import { onRequestGet as adminReturnsGet, onRequestPatch as adminReturnsPatch } from '../functions/api/admin/returns.js';
import { onRequestGet as adminCustomersGet } from '../functions/api/admin/customers.js';
import { onRequestGet as adminProductsGet, onRequestPatch as adminProductsPatch, onRequestPost as adminProductsPost } from '../functions/api/admin/products.js';
import { onRequestGet as adminInventoryGet } from '../functions/api/admin/inventory.js';
import { onRequestGet as adminDashboardGet } from '../functions/api/admin/dashboard.js';
import { onRequestPost as adminSessionPost } from '../functions/api/admin/session.js';
import { onRequestPost as adminInventoryAdjustPost } from '../functions/api/admin/inventory/adjust.js';
import { onRequestPatch as adminInventorySlugPatch } from '../functions/api/admin/inventory/[slug].js';
import { onRequestGet as adminInventoryMovementsGet } from '../functions/api/admin/inventory/[slug]/movements.js';
import { onRequestGet as adminLotsGet, onRequestPost as adminLotsPost, onRequestPatch as adminLotsPatch } from '../functions/api/admin/lots.js';
import { onRequestGet as adminSuppliersGet, onRequestPost as adminSuppliersPost, onRequestPatch as adminSuppliersPatch } from '../functions/api/admin/suppliers.js';
import { onRequestGet as adminComplianceGet, onRequestPatch as adminCompliancePatch } from '../functions/api/admin/compliance.js';
import { onRequestGet as adminCouponsGet, onRequestPost as adminCouponsPost, onRequestPatch as adminCouponsPatch } from '../functions/api/admin/coupons/index.js';
import {
  normalizeExclusionList,
  resolveCouponPresentation,
  sanitizeEligibilityMetadataPatch
} from '../functions/api/_lib/coupons.js';
import { buildCouponPatchPayload } from '../functions/api/_lib/coupon-admin.js';
import { onRequestGet as adminShipmentsGet } from '../functions/api/admin/shipments.js';
import { onRequestGet as adminEmailLogsGet } from '../functions/api/admin/email-logs.js';
import { onRequestGet as adminRefundsGet, onRequestPost as adminRefundsPost } from '../functions/api/admin/refunds.js';
import { onRequestGet as adminInvoicesGet, onRequestPost as adminInvoicesPost, onRequestPatch as adminInvoicesPatch } from '../functions/api/admin/invoices.js';
import { onRequestGet as adminBankAccountsGet, onRequestPost as adminBankAccountsPost, onRequestPatch as adminBankAccountsPatch } from '../functions/api/admin/bank-accounts.js';
import { confirmManualBankTransferPayment, rejectManualBankTransferPayment } from '../functions/api/_lib/commerce-finalization.js';
import { EMAIL_TYPES, safeEmailType, recordEmailEvent } from '../functions/api/_lib/email-events.js';
import { resendOrderEmail } from '../functions/api/admin/orders.js';
import { onRequestPost as customerReturnsPost } from '../functions/api/returns.js';
import { onRequest as reviewsApi } from '../functions/api/reviews/[[path]].js';
import {
  resolveDeliveryTimestamp,
  isDeliveredForReturn,
  withinReturnWindow,
  validateCumulativeReturnQuantities,
  buildClaimedQuantityMap
} from '../functions/api/returns.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = { SUPABASE_URL:'https://local.supabase.test', SUPABASE_SERVICE_ROLE_KEY:'service-test', SUPABASE_TIMEOUT_MS:'3000' };
function response(body, status=200) { return new Response(JSON.stringify(body), {status,headers:{'content-type':'application/json'}}); }
function contextFor(request, extra={}) { return { request, env:{...env,...extra.env}, params:extra.params||{} }; }
function requestJson(url, body, headers={}) { return new Request(url,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)}); }

const validBank = { bank_name:'Test Bankası', account_holder:'COSMOSKIN TEST', iban:'TR330006100519786457841326', currency:'TRY', is_active:true };
const validCustomer = {
  first_name:'Test', last_name:'Müşteri', email:'qa.user@cosmoskin.invalid', phone:'05551234567', city:'İstanbul', district:'Maltepe', postal_code:'34840',
  invoice_type:'Bireysel', address:'Test Mahallesi No 1 Daire 2', kvkk_acknowledged:true, preliminary_information_accepted:true, distance_sales_accepted:true
};

function installFetch(handler) {
  const previous = globalThis.fetch;
  globalThis.fetch = handler;
  return () => { globalThis.fetch = previous; };
}

test('Turkish IBAN normalization and MOD-97 validation', () => {
  assert.equal(normalizeIban('tr33 0006 1005 1978 6457 8413 26'), 'TR330006100519786457841326');
  assert.equal(isValidTurkishIban('TR330006100519786457841326'), true);
  assert.equal(isValidTurkishIban('TR330006100519786457841327'), false);
  assert.deepEqual(validateBankAccount(validBank).errors, []);
  assert.equal(validateBankAccount({...validBank,is_active:false}).valid, false);
});

test('free-shipping coupon overrides shipping without negative totals', () => {
  const free = calculateCouponPreview({discount_type:'free_shipping'},899,'express');
  assert.equal(free.shipping,0); assert.equal(free.total,899); assert.equal(free.freeShipping,true);
  const percent = calculateCouponPreview({discount_type:'percent',discount_value:200},100,'standard');
  assert.equal(percent.discount,100); assert.equal(percent.total,0);
  const totals = calculateTotalsWithCoupon([{line_total:899}],{discount:0,freeShipping:true},'express');
  assert.deepEqual({shipping:totals.shipping,total:totals.total},{shipping:0,total:899});
  const restored = calculateTotalsWithCoupon([{line_total:899}],null,'standard');
  assert.equal(restored.shipping,89); assert.equal(restored.total,988);
});

test('EFT reservation duration is centrally bounded', () => {
  assert.equal(getEftReservationMinutes({EFT_RESERVATION_MINUTES:'1440'}),1440);
  assert.equal(getEftReservationMinutes({EFT_RESERVATION_MINUTES:'1'}),30);
  assert.equal(getEftReservationMinutes({EFT_RESERVATION_MINUTES:'999999'}),10080);
});

test('inventory rules distinguish missing, stock-zero, stock-one quantity-two and active stock', () => {
  const slug='beauty-of-joseon-relief-sun-spf50';
  const missing=buildCheckItem({product_slug:slug,quantity:1},new Map());
  assert.equal(missing.can_purchase,false); assert.match(missing.message,/Ürün bulunamadı|satışta değil|stok kaydı|stokta yok/i);
  const zero=buildCheckItem({product_slug:slug,quantity:1},new Map([[slug,{status:'active',available_stock:0,allow_backorder:false}]]));
  assert.equal(zero.can_purchase,false); assert.equal(zero.reason,'out_of_stock'); assert.match(zero.message,/stokta yok/i);
  const tooMany=buildCheckItem({product_slug:slug,quantity:2},new Map([[slug,{status:'active',available_stock:1,allow_backorder:false}]]));
  assert.equal(tooMany.can_purchase,false); assert.equal(tooMany.reason,'insufficient_stock'); assert.match(tooMany.message,/yeterli stok|yalnızca 1/i);
  const ok=buildCheckItem({product_slug:slug,quantity:1},new Map([[slug,{status:'active',available_stock:1,allow_backorder:false,low_stock_threshold:2}]]));
  assert.equal(ok.can_purchase,true);
});

test('I1: validateCartStock returns structured stock_unavailable items from trusted inventory map', async () => {
  const slug = 'beauty-of-joseon-relief-sun-spf50';
  const restore = installFetch(async (url) => {
    const href = String(url);
    if (href.includes('/rest/v1/product_inventory')) {
      return response([{ product_slug: slug, stock_on_hand: 0, stock_reserved: 0, allow_backorder: false, status: 'active', low_stock_threshold: 5 }]);
    }
    return response([]);
  });
  try {
    const result = await validateCartStock({ env }, [{ product_slug: slug, quantity: 1, product_name: 'Relief Sun' }]);
    assert.equal(result.ok, false);
    assert.equal(result.error, 'stock_unavailable');
    assert.match(result.message, /stokta olmayan/i);
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].reason, 'out_of_stock');
    assert.equal(result.items[0].requested_quantity, 1);
    assert.equal(result.items[0].available_quantity, 0);
  } finally { restore(); }
});

test('I1: create-checkout rejects out-of-stock cart before reservation with structured items[]', async () => {
  const slug = 'beauty-of-joseon-relief-sun-spf50';
  const calls = [];
  const restore = installFetch(async (url) => {
    calls.push(String(url));
    const href = String(url);
    if (href.includes('/rest/v1/product_inventory')) {
      return response([{ product_slug: slug, stock_on_hand: 0, stock_reserved: 0, allow_backorder: false, status: 'active', low_stock_threshold: 5 }]);
    }
    if (href.includes('/rest/v1/payment_bank_accounts')) {
      return response([{ bank_name: 'Test Bankası', account_holder: 'COSMOSKIN TEST', iban: 'TR330006100519786457841326', currency: 'TRY', is_active: true }]);
    }
    return response([]);
  });
  try {
    const req = requestJson('https://local.test/api/create-checkout', {
      payment_method: 'bank_transfer',
      idempotency_key: 'local-i1-oos-0001',
      cart: [{ slug, quantity: 1 }],
      customer: validCustomer
    });
    const res = await createCheckout(contextFor(req));
    const data = await res.json();
    assert.equal(res.status, 409);
    assert.equal(data.error, 'stock_unavailable');
    assert.equal(Array.isArray(data.items), true);
    assert.equal(data.items[0].reason, 'out_of_stock');
    assert.equal(calls.some((url) => url.includes('/rpc/reserve_order_inventory')), false);
    assert.equal(calls.some((url) => url.includes('/rest/v1/orders') && !url.includes('checkout_idempotency_key')), false);
  } finally { restore(); }
});

test('I1: create-checkout rejects inactive product and quantity above available stock', async () => {
  const slug = 'beauty-of-joseon-relief-sun-spf50';
  const bankRows = [{ bank_name: 'Test Bankası', account_holder: 'COSMOSKIN TEST', iban: 'TR330006100519786457841326', currency: 'TRY', is_active: true }];
  const restoreInactive = installFetch(async (url) => {
    const href = String(url);
    if (href.includes('/rest/v1/product_inventory')) {
      return response([{ product_slug: slug, stock_on_hand: 5, stock_reserved: 0, allow_backorder: false, status: 'inactive', low_stock_threshold: 5 }]);
    }
    if (href.includes('/rest/v1/payment_bank_accounts')) return response(bankRows);
    return response([]);
  });
  try {
    const req = requestJson('https://local.test/api/create-checkout', {
      payment_method: 'bank_transfer',
      idempotency_key: 'local-i1-inactive-0001',
      cart: [{ slug, quantity: 1 }],
      customer: validCustomer
    });
    const res = await createCheckout(contextFor(req));
    const data = await res.json();
    assert.equal(res.status, 409);
    assert.equal(data.code, 'PRODUCT_NOT_ACTIVE');
    assert.equal(data.items[0].reason, 'product_inactive');
  } finally { restoreInactive(); }

  const restoreQty = installFetch(async (url) => {
    const href = String(url);
    if (href.includes('/rest/v1/product_inventory')) {
      return response([{ product_slug: slug, stock_on_hand: 2, stock_reserved: 1, allow_backorder: false, status: 'active', low_stock_threshold: 5 }]);
    }
    if (href.includes('/rest/v1/payment_bank_accounts')) return response(bankRows);
    return response([]);
  });
  try {
    const req = requestJson('https://local.test/api/create-checkout', {
      payment_method: 'bank_transfer',
      idempotency_key: 'local-i1-qty-0001',
      cart: [{ slug, quantity: 2 }],
      customer: validCustomer
    });
    const res = await createCheckout(contextFor(req));
    const data = await res.json();
    assert.equal(res.status, 409);
    assert.equal(data.items[0].reason, 'insufficient_stock');
    assert.equal(data.items[0].available_quantity, 1);
  } finally { restoreQty(); }
});

test('R1: PDP review image path uses multipart per-review upload and not retired endpoint', async () => {
  const src = await fs.readFile(path.join(root, 'js/reviews.js'), 'utf8');
  assert.doesNotMatch(src, /\/reviews\/images/);
  assert.equal(src.includes('/reviews/${encodeURIComponent(reviewId)}/images'), true);
  assert.match(src, /new FormData\(\)/);
  assert.match(src, /Yorumunuz kaydedildi ancak görsel yüklenemedi\./);
  assert.match(src, /Görsel boyutu çok büyük\./);
  assert.match(src, /Desteklenmeyen görsel formatı\./);
});

test('R1: uploadReviewPhoto attaches image only to owner review and creates review_images row', async () => {
  const slug = 'beauty-of-joseon-relief-sun-spf50';
  const calls = [];
  const restore = installFetch(async (url, options = {}) => {
    const href = String(url);
    calls.push({ href, method: options.method || 'GET', body: options.body || null });
    if (href.includes('/auth/v1/user')) return response({ id: 'user-r1', email: 'r1@example.test', user_metadata: { first_name: 'R1' } });
    if (href.includes('/rest/v1/reviews')) {
      return response([{ id: 'review-r1', product_slug: slug, user_id: 'user-r1', user_display_name: 'R1', user_email: 'r1@example.test', title: 'Test', body: 'Review body valid', rating: 5, status: 'pending', approved: false, review_images: [] }]);
    }
    if (href.includes('/storage/v1/object/review-images/')) return response({ Key: 'review-images/user-r1/review-r1/photo.jpg' }, 200);
    if (href.includes('/rest/v1/review_images')) {
      return response([{ id: 'image-r1', review_id: 'review-r1', storage_path: 'user-r1/review-r1/photo.jpg', public_url: 'https://local.supabase.test/storage/v1/object/public/review-images/user-r1/review-r1/photo.jpg', status: 'pending', width: null, height: null, created_at: '2026-07-06T00:00:00Z' }]);
    }
    return response([]);
  });
  try {
    const fd = new FormData();
    fd.append('image', new File([new Uint8Array([0xff, 0xd8, 0xff, 0x00])], 'photo.jpg', { type: 'image/jpeg' }));
    const req = new Request('https://local.test/api/reviews/review-r1/images', { method: 'POST', headers: { authorization: 'Bearer customer-token' }, body: fd });
    const res = await reviewsApi(contextFor(req));
    const data = await res.json();
    assert.equal(res.status, 201);
    assert.equal(data.image.storage_path, 'user-r1/review-r1/photo.jpg');
    assert.equal(data.image.signed_url, data.image.public_url);
    assert.equal(calls.some((call) => call.href.includes('/storage/v1/object/review-images/user-r1/review-r1/')), true);
    assert.equal(calls.some((call) => call.href.includes('/rest/v1/review_images') && call.method === 'POST'), true);
  } finally { restore(); }
});

test('R1: uploadReviewPhoto blocks another customer and rejects invalid or oversized images', async () => {
  const restoreOther = installFetch(async (url) => {
    const href = String(url);
    if (href.includes('/auth/v1/user')) return response({ id: 'user-r1', email: 'r1@example.test' });
    if (href.includes('/rest/v1/reviews')) return response([{ id: 'review-r1', user_id: 'other-user', review_images: [] }]);
    return response([]);
  });
  try {
    const fd = new FormData();
    fd.append('image', new File([new Uint8Array([0xff, 0xd8, 0xff])], 'photo.jpg', { type: 'image/jpeg' }));
    const req = new Request('https://local.test/api/reviews/review-r1/images', { method: 'POST', headers: { authorization: 'Bearer customer-token' }, body: fd });
    const res = await reviewsApi(contextFor(req));
    assert.equal(res.status, 403);
    const blocked = await res.json();
    assert.equal(blocked.code, 'review_ownership_mismatch');
  } finally { restoreOther(); }

  const restoreInvalid = installFetch(async (url) => {
    const href = String(url);
    if (href.includes('/auth/v1/user')) return response({ id: 'user-r1', email: 'r1@example.test' });
    if (href.includes('/rest/v1/reviews')) return response([{ id: 'review-r1', user_id: 'user-r1', review_images: [] }]);
    return response([]);
  });
  try {
    const badType = new FormData();
    badType.append('image', new File(['x'], 'photo.gif', { type: 'image/gif' }));
    const badTypeRes = await reviewsApi(contextFor(new Request('https://local.test/api/reviews/review-r1/images', { method: 'POST', headers: { authorization: 'Bearer customer-token' }, body: badType })));
    const badTypeData = await badTypeRes.json();
    assert.equal(badTypeRes.status, 400);
    assert.equal(badTypeData.code, 'invalid_image_type');
    assert.equal(badTypeData.error, 'Desteklenmeyen görsel formatı.');

    const oversized = new FormData();
    oversized.append('image', new File([new Uint8Array((2 * 1024 * 1024) + 1)], 'large.jpg', { type: 'image/jpeg' }));
    const oversizedRes = await reviewsApi(contextFor(new Request('https://local.test/api/reviews/review-r1/images', { method: 'POST', headers: { authorization: 'Bearer customer-token' }, body: oversized })));
    const oversizedData = await oversizedRes.json();
    assert.equal(oversizedRes.status, 400);
    assert.equal(oversizedData.error, 'Görsel boyutu çok büyük.');
  } finally { restoreInvalid(); }
});

test('R1: reviews API ignores raw client image paths on create and keeps retired endpoint disabled', async () => {
  const slug = 'beauty-of-joseon-relief-sun-spf50';
  const calls = [];
  const restore = installFetch(async (url, options = {}) => {
    const href = String(url);
    calls.push({ href, method: options.method || 'GET', body: options.body ? String(options.body) : '' });
    if (href.includes('/auth/v1/user')) return response({ id: 'user-r1', email: 'r1@example.test' });
    if (href.includes('/rest/v1/orders')) return response([{ id: 'order-r1' }]);
    if (href.includes('/rest/v1/order_items')) return response([{ product_slug: slug, product_name: 'Relief Sun' }]);
    if (href.includes('/rest/v1/reviews') && (options.method || 'GET') === 'POST') return response([{ id: 'review-r1', product_slug: slug, user_id: 'user-r1', title: 'R1', body: 'Valid review body', rating: 5, status: 'pending', review_images: [] }]);
    if (href.includes('/rest/v1/reviews')) return response([]);
    if (href.includes('/rest/v1/review_images')) return response([{ id: 'bad' }]);
    return response([]);
  });
  try {
    const retiredReq = requestJson('https://local.test/api/reviews/images', { review_id: 'review-r1', images: [] }, { authorization: 'Bearer customer-token' });
    const retiredRes = await reviewsApi(contextFor(retiredReq));
    assert.equal(retiredRes.status, 410);

    const createReq = requestJson('https://local.test/api/reviews', {
      product_slug: slug,
      title: 'R1 Review',
      body: 'Valid review body',
      rating: 5,
      images: [{ storagePath: 'user-r1/review-r1/raw.jpg', publicUrl: 'https://example.test/raw.jpg' }]
    }, { authorization: 'Bearer customer-token' });
    const createRes = await reviewsApi(contextFor(createReq));
    assert.equal(createRes.status, 200);
    assert.equal(calls.some((call) => call.href.includes('/rest/v1/review_images') && call.method === 'POST'), false);
  } finally { restore(); }
});

test('R1: admin reviews API returns normalized image objects and fallback-ready UI markers exist', async () => {
  const slug = 'beauty-of-joseon-relief-sun-spf50';
  const restore = installFetch(async (url) => {
    const href = String(url);
    if (href.includes('/rest/v1/reviews')) {
      return response([{ id: 'review-r1', product_slug: slug, user_id: 'user-r1', user_display_name: 'R1', user_email: 'r1@example.test', title: 'R1', body: 'Valid review body', rating: 5, status: 'pending', approved: false, review_images: [{ id: 'image-r1', storage_path: 'user-r1/review-r1/photo.jpg', public_url: '', status: 'pending', width: 1000, height: 1000, created_at: '2026-07-06T00:00:00Z' }] }]);
    }
    return response([]);
  });
  try {
    const req = new Request('https://local.test/api/reviews/admin', { headers: { 'x-admin-token': 'admin-token' } });
    const res = await reviewsApi(contextFor(req, { env: { ADMIN_TOKEN: 'admin-token', ADMIN_SESSION_SECRET: 'b'.repeat(64), ADMIN_ALLOW_LEGACY_TOKEN: 'true' } }));
    const data = await res.json();
    assert.equal(res.status, 200);
    const image = data.reviews[0].images[0];
    assert.equal(image.storage_path, 'user-r1/review-r1/photo.jpg');
    assert.match(image.public_url, /\/storage\/v1\/object\/public\/review-images\/user-r1\/review-r1\/photo\.jpg$/);
    assert.equal(image.signed_url, image.public_url);
    assert.equal(image.thumbnail_url, image.public_url);
    assert.equal(image.filename, 'photo.jpg');
    assert.equal(image.mime_type, null);
    assert.equal(image.size_bytes, null);
  } finally { restore(); }

  const adminUi = await fs.readFile(path.join(root, 'admin/reviews/index.html'), 'utf8');
  assert.match(adminUi, /Görsel yüklenemedi/);
  assert.match(adminUi, /imagePreviewUrl/);
  assert.match(adminUi, /signed_url \|\| image\.thumbnail_url \|\| image\.public_url \|\| image\.url/);
});

const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const WEBP_BYTES = (() => {
  const bytes = new Uint8Array(12);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0);
  bytes.set([0x57, 0x45, 0x42, 0x50], 8);
  return bytes;
})();

function reviewUploadMocks(slug = 'beauty-of-joseon-relief-sun-spf50', userId = 'user-r1') {
  return async (url, options = {}) => {
    const href = String(url);
    if (href.includes('/auth/v1/user')) return response({ id: userId, email: 'r1@example.test', user_metadata: { first_name: 'R1' } });
    if (href.includes('/rest/v1/reviews')) {
      return response([{ id: 'review-r1', product_slug: slug, user_id: userId, review_images: [] }]);
    }
    if (href.includes('/storage/v1/object/review-images/')) return response({ Key: 'review-images/ok' }, 200);
    if (href.includes('/rest/v1/review_images')) {
      return response([{ id: 'image-r1', review_id: 'review-r1', storage_path: 'user-r1/review-r1/photo.jpg', public_url: 'https://local.supabase.test/storage/v1/object/public/review-images/user-r1/review-r1/photo.jpg', status: 'pending', width: null, height: null, created_at: '2026-07-06T00:00:00Z' }]);
    }
    return response([]);
  };
}

let reviewUploadIpCounter = 0;

async function postReviewImage(body, headers = { authorization: 'Bearer customer-token' }) {
  reviewUploadIpCounter += 1;
  const req = new Request('https://local.test/api/reviews/review-r1/images', {
    method: 'POST',
    headers: { ...headers, 'cf-connecting-ip': `10.0.0.${reviewUploadIpCounter}` },
    body
  });
  const res = await reviewsApi(contextFor(req));
  return { res, data: await res.json() };
}

test('R1B: upload accepts valid JPEG with normal image/jpeg type', async () => {
  const restore = installFetch(reviewUploadMocks());
  try {
    const fd = new FormData();
    fd.append('image', new File([JPEG_BYTES], 'photo.jpg', { type: 'image/jpeg' }));
    const { res, data } = await postReviewImage(fd);
    assert.equal(res.status, 201);
    assert.equal(data.ok, true);
    assert.equal(data.image.mime_type, 'image/jpeg');
  } finally { restore(); }
});

test('R1B: upload accepts valid JPEG when file.type is empty', async () => {
  const restore = installFetch(reviewUploadMocks());
  try {
    const fd = new FormData();
    fd.append('image', new File([JPEG_BYTES], 'photo.jpg', { type: '' }));
    const { res, data } = await postReviewImage(fd);
    assert.equal(res.status, 201);
    assert.equal(data.image.mime_type, 'image/jpeg');
  } finally { restore(); }
});

test('R1B: upload accepts Blob-like multipart part', async () => {
  const restore = installFetch(reviewUploadMocks());
  try {
    const fd = new FormData();
    fd.append('image', new Blob([JPEG_BYTES], { type: '' }), 'photo.jpg');
    const { res, data } = await postReviewImage(fd);
    assert.equal(res.status, 201);
    assert.equal(data.image.mime_type, 'image/jpeg');
  } finally { restore(); }
});

test('R1B: upload accepts PNG and WEBP via byte sniffing', async () => {
  const restore = installFetch(reviewUploadMocks());
  try {
    const pngFd = new FormData();
    pngFd.append('image', new Blob([PNG_BYTES], { type: '' }), 'photo.png');
    const pngRes = await postReviewImage(pngFd);
    assert.equal(pngRes.res.status, 201);
    assert.equal(pngRes.data.image.mime_type, 'image/png');

    const webpFd = new FormData();
    webpFd.append('image', new Blob([WEBP_BYTES], { type: '' }), 'photo.webp');
    const webpRes = await postReviewImage(webpFd);
    assert.equal(webpRes.res.status, 201);
    assert.equal(webpRes.data.image.mime_type, 'image/webp');
  } finally { restore(); }
});

test('R1B: upload rejects invalid bytes and unsupported declared types with structured codes', async () => {
  const restore = installFetch(reviewUploadMocks());
  try {
    const invalidFd = new FormData();
    invalidFd.append('image', new Blob([new Uint8Array([1, 2, 3, 4])], { type: '' }), 'bad.bin');
    const invalid = await postReviewImage(invalidFd);
    assert.equal(invalid.res.status, 400);
    assert.equal(invalid.data.code, 'invalid_image_type');

    const gifFd = new FormData();
    gifFd.append('image', new File(['gif'], 'photo.gif', { type: 'image/gif' }));
    const gif = await postReviewImage(gifFd);
    assert.equal(gif.res.status, 400);
    assert.equal(gif.data.code, 'invalid_image_type');
  } finally { restore(); }
});

test('R1C: missing review_images.storage_path column retries insert without it', async () => {
  let sawInsertWithStoragePath = false;
  let sawRetryWithoutStoragePath = false;
  const restore = installFetch(async (url, options = {}) => {
    const href = String(url);
    if (href.includes('/auth/v1/user')) return response({ id: 'user-r1', email: 'r1@example.test', user_metadata: { first_name: 'R1' } });
    if (href.includes('/rest/v1/reviews')) return response([{ id: 'review-r1', user_id: 'user-r1', review_images: [] }]);
    if (href.includes('/storage/v1/object/review-images/')) return response({ Key: 'ok' }, 200);
    if (href.includes('/rest/v1/review_images') && (options.method || 'GET') === 'POST') {
      const parsed = JSON.parse(String(options.body || '{}'));
      const body = Array.isArray(parsed) ? (parsed[0] || {}) : parsed;
      if (Object.prototype.hasOwnProperty.call(body, 'storage_path')) {
        sawInsertWithStoragePath = true;
        return response({ message: 'column review_images.storage_path does not exist' }, 400);
      }
      sawRetryWithoutStoragePath = true;
      return response([{
        id: 'image-r1',
        review_id: 'review-r1',
        user_id: 'user-r1',
        public_url: 'https://local.supabase.test/storage/v1/object/public/review-images/user-r1/review-r1/photo.jpg',
        status: 'pending',
        sort_order: 0,
        width: null,
        height: null,
        created_at: '2026-07-06T00:00:00Z'
      }]);
    }
    return response([]);
  });
  try {
    const fd = new FormData();
    fd.append('image', new File([JPEG_BYTES], 'photo.jpg', { type: '' }));
    const { res, data } = await postReviewImage(fd);
    assert.equal(res.status, 201);
    assert.equal(data.ok, true);
    assert.equal(sawInsertWithStoragePath, true);
    assert.equal(sawRetryWithoutStoragePath, true);
    assert.match(String(data.image.public_url || ''), /review-images/);
  } finally { restore(); }
});

test('R1C: DB insert failure returns image_record_failed and attempts storage cleanup', async () => {
  const calls = [];
  const restore = installFetch(async (url, options = {}) => {
    const href = String(url);
    calls.push({ href, method: options.method || 'GET', body: options.body ? String(options.body).slice(0, 200) : '' });
    if (href.includes('/auth/v1/user')) return response({ id: 'user-r1', email: 'r1@example.test', user_metadata: { first_name: 'R1' } });
    if (href.includes('/rest/v1/reviews')) return response([{ id: 'review-r1', user_id: 'user-r1', review_images: [] }]);
    if (href.includes('/storage/v1/object/review-images/') && (options.method || 'GET') === 'POST') return response({ Key: 'ok' }, 200);
    if (href.includes('/rest/v1/review_images') && (options.method || 'GET') === 'POST') {
      return response({ message: 'null value in column \"public_url\" violates not-null constraint' }, 400);
    }
    if (href.includes('/storage/v1/object/review-images/') && (options.method || 'GET') === 'DELETE') {
      return response({ ok: true }, 200);
    }
    return response([]);
  });
  try {
    const fd = new FormData();
    fd.append('image', new File([JPEG_BYTES], 'photo.jpg', { type: 'image/jpeg' }));
    const { res, data } = await postReviewImage(fd);
    assert.equal(res.status, 503);
    assert.equal(data.code, 'image_record_failed');
    assert.equal(calls.some((c) => c.method === 'DELETE' && c.href.includes('/storage/v1/object/review-images/')), true);
  } finally { restore(); }
});

test('R1D: upload inserts live review_images schema fields', async () => {
  let insertBody = null;
  const restore = installFetch(async (url, options = {}) => {
    const href = String(url);
    if (href.includes('/auth/v1/user')) return response({ id: 'user-r1', email: 'r1@example.test', user_metadata: { first_name: 'R1' } });
    if (href.includes('/rest/v1/reviews')) {
      return response([{
        id: 'review-r1',
        user_id: 'user-r1',
        review_images: [{ id: 'image-existing', sort_order: 2, status: 'pending' }]
      }]);
    }
    if (href.includes('/storage/v1/object/review-images/') && (options.method || 'GET') === 'POST') return response({ Key: 'ok' }, 200);
    if (href.includes('/rest/v1/review_images') && (options.method || 'GET') === 'POST') {
      const parsed = JSON.parse(String(options.body || '{}'));
      insertBody = Array.isArray(parsed) ? (parsed[0] || {}) : parsed;
      return response([{
        id: 'image-r1d',
        review_id: 'review-r1',
        user_id: 'user-r1',
        storage_path: insertBody.storage_path,
        public_url: insertBody.public_url,
        status: insertBody.status,
        sort_order: insertBody.sort_order,
        original_name: insertBody.original_name,
        file_size_kb: insertBody.file_size_kb,
        mime_type: insertBody.mime_type,
        width: null,
        height: null,
        created_at: '2026-07-07T00:00:00Z'
      }]);
    }
    return response([]);
  });
  try {
    const fd = new FormData();
    fd.append('image', new File([JPEG_BYTES], 'customer-photo.jpg', { type: 'image/jpeg' }));
    const { res, data } = await postReviewImage(fd);
    assert.equal(res.status, 201);
    assert.equal(data.ok, true);
    assert.equal(insertBody.review_id, 'review-r1');
    assert.equal(insertBody.user_id, 'user-r1');
    assert.match(String(insertBody.storage_path || ''), /^user-r1\/review-r1\//);
    assert.match(String(insertBody.public_url || ''), /review-images/);
    assert.equal(insertBody.status, 'pending');
    assert.equal(insertBody.sort_order, 3);
    assert.equal(insertBody.original_name, 'customer-photo.jpg');
    assert.equal(insertBody.file_size_kb, 1);
    assert.equal(insertBody.mime_type, 'image/jpeg');
    assert.equal(Object.prototype.hasOwnProperty.call(insertBody, 'filename'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(insertBody, 'size_bytes'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(insertBody, 'metadata'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(insertBody, 'customer_id'), false);
    assert.equal(data.image.filename, 'customer-photo.jpg');
  } finally { restore(); }
});

test('R1D: upload blocks another customer review ownership', async () => {
  const restore = installFetch(async (url) => {
    const href = String(url);
    if (href.includes('/auth/v1/user')) return response({ id: 'user-r1', email: 'r1@example.test' });
    if (href.includes('/rest/v1/reviews')) return response([{ id: 'review-r1', user_id: 'other-user', review_images: [] }]);
    return response([]);
  });
  try {
    const fd = new FormData();
    fd.append('image', new File([JPEG_BYTES], 'photo.jpg', { type: 'image/jpeg' }));
    const { res, data } = await postReviewImage(fd);
    assert.equal(res.status, 403);
    assert.equal(data.code, 'review_ownership_mismatch');
  } finally { restore(); }
});

test('R1D: admin API returns uploaded image in images array', async () => {
  const slug = 'beauty-of-joseon-relief-sun-spf50';
  const restore = installFetch(async (url) => {
    const href = String(url);
    if (href.includes('/rest/v1/reviews')) {
      return response([{
        id: 'review-r1',
        product_slug: slug,
        user_id: 'user-r1',
        user_display_name: 'R1',
        user_email: 'r1@example.test',
        title: 'R1',
        body: 'Valid review body',
        rating: 5,
        status: 'pending',
        approved: false,
        review_images: [{
          id: 'image-r1d',
          storage_path: 'user-r1/review-r1/photo.jpg',
          public_url: 'https://local.supabase.test/storage/v1/object/public/review-images/user-r1/review-r1/photo.jpg',
          status: 'pending',
          sort_order: 0,
          original_name: 'photo.jpg',
          file_size_kb: 1,
          mime_type: 'image/jpeg',
          width: null,
          height: null,
          created_at: '2026-07-07T00:00:00Z'
        }]
      }]);
    }
    return response([]);
  });
  try {
    const req = new Request('https://local.test/api/reviews/admin', {
      headers: { 'x-admin-token': 'admin-token' }
    });
    const res = await reviewsApi(contextFor(req, { env: { ADMIN_TOKEN: 'admin-token', ADMIN_SESSION_SECRET: 'b'.repeat(64), ADMIN_ALLOW_LEGACY_TOKEN: 'true' } }));
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.reviews[0].images.length, 1);
    assert.equal(data.reviews[0].images[0].status, 'pending');
    assert.match(String(data.reviews[0].images[0].public_url || ''), /review-images/);
  } finally { restore(); }
});

test('R1D: retired /api/reviews/images remains 410 Gone', async () => {
  const req = requestJson('https://local.test/api/reviews/images', { review_id: 'review-r1', images: [] }, { authorization: 'Bearer customer-token' });
  const res = await reviewsApi(contextFor(req));
  assert.equal(res.status, 410);
});

const adminReviewEnv = {
  ADMIN_TOKEN: 'admin-token',
  ADMIN_SESSION_SECRET: 'b'.repeat(64),
  ADMIN_ALLOW_LEGACY_TOKEN: 'true'
};

function adminReviewRequest(path, method = 'GET', body = null) {
  const init = {
    method,
    headers: { 'x-admin-token': 'admin-token' }
  };
  if (body != null) {
    init.headers['content-type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  return new Request(`https://local.test/api/reviews${path}`, init);
}

test('R1E: main review approval also approves attached pending images', async () => {
  const imagePatches = [];
  const restore = installFetch(async (url, options = {}) => {
    const href = String(url);
    const method = options.method || 'GET';
    if (href.includes('/rest/v1/reviews') && method === 'PATCH' && !href.includes('review_images')) {
      return response({ ok: true }, 200);
    }
    if (href.includes('/rest/v1/review_images') && method === 'PATCH' && href.includes('status=eq.pending')) {
      imagePatches.push({ href, body: JSON.parse(String(options.body || '{}')) });
      return response({ ok: true }, 200);
    }
    if (href.includes('/rest/v1/reviews') && href.includes('id=eq.review-r1e')) {
      return response([{
        id: 'review-r1e',
        product_slug: 'beauty-of-joseon-relief-sun-spf50',
        user_id: 'user-r1',
        title: 'R1E',
        body: 'Valid review body text',
        rating: 5,
        status: 'approved',
        approved: true,
        review_images: [
          { id: 'img-pending', storage_path: 'user-r1/review-r1e/a.jpg', public_url: 'https://local.supabase.test/storage/v1/object/public/review-images/user-r1/review-r1e/a.jpg', status: 'approved', sort_order: 0, created_at: '2026-07-07T00:00:00Z' },
          { id: 'img-rejected', storage_path: 'user-r1/review-r1e/b.jpg', public_url: 'https://local.supabase.test/storage/v1/object/public/review-images/user-r1/review-r1e/b.jpg', status: 'rejected', sort_order: 1, created_at: '2026-07-07T00:00:00Z' }
        ]
      }]);
    }
    return response([]);
  });
  try {
    const res = await reviewsApi(contextFor(adminReviewRequest('/admin/review-r1e', 'PATCH', { status: 'approved' }), { env: adminReviewEnv }));
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.ok, true);
    assert.equal(imagePatches.length, 1);
    assert.equal(imagePatches[0].body.status, 'approved');
    assert.equal(Object.prototype.hasOwnProperty.call(imagePatches[0].body, 'moderated_by'), false);
    assert.equal(data.review.images.find((img) => img.id === 'img-pending').status, 'approved');
    assert.equal(data.review.images.find((img) => img.id === 'img-rejected').status, 'rejected');
  } finally { restore(); }
});

test('R1E: image-level approve updates status without invalid moderated_by', async () => {
  let patchBody = null;
  let imageStatus = 'pending';
  const restore = installFetch(async (url, options = {}) => {
    const href = String(url);
    const method = options.method || 'GET';
    if (href.includes('/rest/v1/review_images') && method === 'PATCH') {
      patchBody = JSON.parse(String(options.body || '{}'));
      imageStatus = patchBody.status || imageStatus;
      return response({ ok: true }, 200);
    }
    if (href.includes('/rest/v1/review_images') && href.includes('id=eq.img-r1e')) {
      return response([{
        id: 'img-r1e',
        review_id: 'review-r1e',
        status: imageStatus,
        storage_path: 'user-r1/review-r1e/a.jpg',
        public_url: 'https://local.supabase.test/storage/v1/object/public/review-images/user-r1/review-r1e/a.jpg',
        width: null,
        height: null,
        created_at: '2026-07-07T00:00:00Z'
      }]);
    }
    return response([]);
  });
  try {
    const res = await reviewsApi(contextFor(adminReviewRequest('/admin/review-r1e/images/img-r1e', 'PATCH', { status: 'approved' }), { env: adminReviewEnv }));
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.ok, true);
    assert.equal(data.code, 'image_updated');
    assert.equal(patchBody.status, 'approved');
    assert.equal(Object.prototype.hasOwnProperty.call(patchBody, 'moderated_by'), false);
    assert.equal(data.image.status, 'approved');
  } finally { restore(); }
});

test('R1E: public API shows approved images and hides pending/rejected', async () => {
  const slug = 'beauty-of-joseon-relief-sun-spf50';
  const restore = installFetch(async (url) => {
    const href = String(url);
    if (href.includes('/rest/v1/reviews')) {
      return response([{
        id: 'review-r1e',
        product_slug: slug,
        user_id: 'user-r1',
        title: 'R1E',
        body: 'Valid review body text',
        rating: 5,
        status: 'approved',
        approved: true,
        review_images: [
          { id: 'img-approved', storage_path: 'user-r1/review-r1e/a.jpg', public_url: 'https://local.supabase.test/storage/v1/object/public/review-images/user-r1/review-r1e/a.jpg', status: 'approved', created_at: '2026-07-07T00:00:00Z' },
          { id: 'img-pending', storage_path: 'user-r1/review-r1e/b.jpg', public_url: 'https://local.supabase.test/storage/v1/object/public/review-images/user-r1/review-r1e/b.jpg', status: 'pending', created_at: '2026-07-07T00:00:00Z' },
          { id: 'img-rejected', storage_path: 'user-r1/review-r1e/c.jpg', public_url: 'https://local.supabase.test/storage/v1/object/public/review-images/user-r1/review-r1e/c.jpg', status: 'rejected', created_at: '2026-07-07T00:00:00Z' }
        ]
      }]);
    }
    return response([]);
  });
  try {
    const req = new Request(`https://local.test/api/reviews?product_slug=${encodeURIComponent(slug)}`);
    const res = await reviewsApi(contextFor(req));
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.reviews.length, 1);
    assert.equal(data.reviews[0].images.length, 1);
    assert.equal(data.reviews[0].images[0].id, 'img-approved');
    assert.match(String(data.reviews[0].images[0].public_url || ''), /review-images/);
  } finally { restore(); }
});

test('R1E: admin UI labels distinguish review and image approval', async () => {
  const adminUi = await fs.readFile(path.join(root, 'admin/reviews/index.html'), 'utf8');
  assert.match(adminUi, /Yorumu ve görselleri onayla/);
  assert.match(adminUi, /Görseli onayla/);
  assert.match(adminUi, /Görseli reddet/);
  assert.match(adminUi, /Görsel beklemede/);
  assert.match(adminUi, /Görsel onaylandı/);
  assert.match(adminUi, /Görsel reddedildi/);
});

test('R1F: image-level approve retries with status-only patch on live schema', async () => {
  let patchAttempts = [];
  let imageStatus = 'pending';
  const restore = installFetch(async (url, options = {}) => {
    const href = String(url);
    const method = options.method || 'GET';
    if (href.includes('/rest/v1/review_images') && method === 'PATCH') {
      const body = JSON.parse(String(options.body || '{}'));
      patchAttempts.push(body);
      if (Object.prototype.hasOwnProperty.call(body, 'moderation_note')) {
        return response({ code: 'PGRST204', message: 'column moderation_note of review_images does not exist' }, 400);
      }
      imageStatus = body.status || imageStatus;
      return response({ ok: true }, 200);
    }
    if (href.includes('/rest/v1/review_images') && href.includes('id=eq.img-r1f')) {
      return response([{
        id: 'img-r1f',
        review_id: 'review-r1f',
        status: imageStatus,
        storage_path: 'user-r1/review-r1f/a.jpg',
        public_url: 'https://local.supabase.test/storage/v1/object/public/review-images/user-r1/review-r1f/a.jpg',
        width: null,
        height: null,
        created_at: '2026-07-07T00:00:00Z'
      }]);
    }
    return response([]);
  });
  try {
    const res = await reviewsApi(contextFor(adminReviewRequest('/admin/review-r1f/images/img-r1f', 'PATCH', { status: 'approved' }), { env: adminReviewEnv }));
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.ok, true);
    assert.equal(data.code, 'image_updated');
    assert.ok(patchAttempts.length >= 2);
    assert.equal(patchAttempts[patchAttempts.length - 1].status, 'approved');
    assert.equal(Object.prototype.hasOwnProperty.call(patchAttempts[patchAttempts.length - 1], 'moderation_note'), false);
    assert.equal(data.image.status, 'approved');
  } finally { restore(); }
});

test('R1F: image-level approve works when parent review is already approved', async () => {
  let patchBody = null;
  const restore = installFetch(async (url, options = {}) => {
    const href = String(url);
    const method = options.method || 'GET';
    if (href.includes('/rest/v1/review_images') && method === 'PATCH') {
      patchBody = JSON.parse(String(options.body || '{}'));
      return response({ ok: true }, 200);
    }
    if (href.includes('/rest/v1/review_images') && href.includes('id=eq.img-approved-parent')) {
      return response([{
        id: 'img-approved-parent',
        review_id: 'review-approved-parent',
        status: patchBody?.status || 'pending',
        storage_path: 'user-r1/review-approved-parent/a.jpg',
        public_url: 'https://local.supabase.test/storage/v1/object/public/review-images/user-r1/review-approved-parent/a.jpg',
        width: null,
        height: null,
        created_at: '2026-07-07T00:00:00Z'
      }]);
    }
    return response([]);
  });
  try {
    const res = await reviewsApi(contextFor(adminReviewRequest('/admin/review-approved-parent/images/img-approved-parent', 'PATCH', { status: 'approved' }), { env: adminReviewEnv }));
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.ok, true);
    assert.equal(patchBody.status, 'approved');
    assert.equal(Object.prototype.hasOwnProperty.call(patchBody, 'moderated_by'), false);
    assert.equal(data.image.status, 'approved');
  } finally { restore(); }
});

test('R1F: image-level reject updates only review_images row', async () => {
  let patchBody = null;
  const restore = installFetch(async (url, options = {}) => {
    const href = String(url);
    const method = options.method || 'GET';
    if (href.includes('/rest/v1/review_images') && method === 'PATCH') {
      patchBody = JSON.parse(String(options.body || '{}'));
      return response({ ok: true }, 200);
    }
    if (href.includes('/rest/v1/reviews') && method === 'PATCH') {
      throw new Error('image-level reject must not patch reviews');
    }
    if (href.includes('/rest/v1/review_images') && href.includes('id=eq.img-reject-r1f')) {
      return response([{
        id: 'img-reject-r1f',
        review_id: 'review-r1f',
        status: patchBody?.status || 'pending',
        storage_path: 'user-r1/review-r1f/b.jpg',
        public_url: 'https://local.supabase.test/storage/v1/object/public/review-images/user-r1/review-r1f/b.jpg',
        width: null,
        height: null,
        created_at: '2026-07-07T00:00:00Z'
      }]);
    }
    return response([]);
  });
  try {
    const res = await reviewsApi(contextFor(adminReviewRequest('/admin/review-r1f/images/img-reject-r1f', 'PATCH', { status: 'rejected' }), { env: adminReviewEnv }));
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.ok, true);
    assert.equal(data.code, 'image_updated');
    assert.equal(patchBody.status, 'rejected');
    assert.equal(data.image.status, 'rejected');
  } finally { restore(); }
});

test('R1F: admin UI image approve sends review id, image id, and status only', async () => {
  const adminUi = await fs.readFile(path.join(root, 'admin/reviews/index.html'), 'utf8');
  assert.match(adminUi, /data-image-action="approve"[^>]*data-review-id="/);
  assert.match(adminUi, /data-image-id="/);
  assert.match(adminUi, /\/images\/' \+ encodeURIComponent\(imageId\)/);
  assert.match(adminUi, /body: JSON\.stringify\(\{\s*status: nextStatus\s*\}\)/);
  assert.doesNotMatch(adminUi, /review_source_table: review\.source_table/);
});

test('R1G: review moderation updated_at migration is idempotent', async () => {
  const migration = await fs.readFile(
    path.join(root, 'supabase/migrations/20260707_r1g_review_moderation_updated_at_fix.sql'),
    'utf8'
  );
  assert.match(migration, /ALTER TABLE public\.reviews[\s\S]*ADD COLUMN IF NOT EXISTS updated_at/i);
  assert.match(migration, /ALTER TABLE public\.review_images[\s\S]*ADD COLUMN IF NOT EXISTS updated_at/i);
  assert.match(migration, /sync_review_approved_from_status/);
  assert.doesNotMatch(migration, /DROP TABLE/i);
  assert.doesNotMatch(migration, /DROP POLICY/i);
});

test('R1G: review approval does not manually PATCH updated_at', async () => {
  let reviewPatchBody = null;
  const restore = installFetch(async (url, options = {}) => {
    const href = String(url);
    const method = options.method || 'GET';
    if (href.includes('/rest/v1/reviews') && method === 'PATCH') {
      reviewPatchBody = JSON.parse(String(options.body || '{}'));
      return response({ ok: true }, 200);
    }
    if (href.includes('/rest/v1/review_images') && method === 'PATCH') {
      return response({ ok: true }, 200);
    }
    if (href.includes('/rest/v1/reviews') && href.includes('id=eq.review-r1g')) {
      return response([{
        id: 'review-r1g',
        product_slug: 'beauty-of-joseon-relief-sun-spf50',
        user_id: 'user-r1',
        title: 'R1G review',
        body: 'Valid review body text',
        rating: 5,
        status: 'approved',
        approved: true,
        review_images: [{
          id: 'img-r1g',
          status: 'approved',
          storage_path: 'user-r1/review-r1g/a.jpg',
          public_url: 'https://local.supabase.test/storage/v1/object/public/review-images/user-r1/review-r1g/a.jpg',
          created_at: '2026-07-07T00:00:00Z'
        }]
      }]);
    }
    return response([]);
  });
  try {
    const res = await reviewsApi(contextFor(adminReviewRequest('/admin/review-r1g', 'PATCH', { status: 'approved' }), { env: adminReviewEnv }));
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.ok, true);
    assert.equal(reviewPatchBody.status, 'approved');
    assert.equal(Object.prototype.hasOwnProperty.call(reviewPatchBody, 'updated_at'), false);
  } finally { restore(); }
});

test('R1G: image-level approve on approved review avoids updated_at payload', async () => {
  let imagePatchBody = null;
  const restore = installFetch(async (url, options = {}) => {
    const href = String(url);
    const method = options.method || 'GET';
    if (href.includes('/rest/v1/review_images') && method === 'PATCH') {
      imagePatchBody = JSON.parse(String(options.body || '{}'));
      return response({ ok: true }, 200);
    }
    if (href.includes('/rest/v1/review_images') && href.includes('id=eq.img-r1g-live')) {
      return response([{
        id: 'img-r1g-live',
        review_id: 'review-approved-r1g',
        status: imagePatchBody?.status || 'pending',
        storage_path: 'user-r1/review-approved-r1g/a.jpg',
        public_url: 'https://local.supabase.test/storage/v1/object/public/review-images/user-r1/review-approved-r1g/a.jpg',
        width: null,
        height: null,
        created_at: '2026-07-07T00:00:00Z'
      }]);
    }
    return response([]);
  });
  try {
    const res = await reviewsApi(contextFor(adminReviewRequest('/admin/review-approved-r1g/images/img-r1g-live', 'PATCH', { status: 'approved' }), { env: adminReviewEnv }));
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.ok, true);
    assert.equal(imagePatchBody.status, 'approved');
    assert.equal(Object.prototype.hasOwnProperty.call(imagePatchBody, 'updated_at'), false);
    assert.equal(data.image.status, 'approved');
  } finally { restore(); }
});

test('R1B: frontend markers support review id fallback and upload error detail', async () => {
  const src = await fs.readFile(path.join(root, 'js/reviews.js'), 'utf8');
  assert.match(src, /resolveReviewId/);
  assert.match(src, /data\?\.review\?\.id/);
  assert.match(src, /await refreshSession\(\)/);
  assert.match(src, /await authHeaders\(\)/);
  assert.match(src, /Yorumunuz kaydedildi ancak görsel yüklenemedi\.\$\{detail\}/);
});

test('atomic inventory RPC success and idempotent release/conversion responses', async () => {
  const calls=[];
  const restore=installFetch(async (url,options={})=>{
    calls.push({url:String(url),body:options.body?JSON.parse(options.body):null});
    if(String(url).endsWith('/rpc/reserve_order_inventory')) return response({ok:true,reservations:[{id:'r1'}]});
    if(String(url).endsWith('/rpc/release_order_inventory')) return response({ok:true,released:0,idempotent:true});
    if(String(url).endsWith('/rpc/convert_order_inventory')) return response({ok:true,converted:0,deducted:0,idempotent:true});
    return response([]);
  });
  try {
    const context={env};
    const reserved=await reserveInventoryForOrder(context,'11111111-1111-4111-8111-111111111111',[{product_slug:'beauty-of-joseon-relief-sun-spf50',quantity:1}]);
    assert.equal(reserved.length,1);
    assert.equal((await releaseInventoryReservations(context,'11111111-1111-4111-8111-111111111111')).idempotent,true);
    assert.equal((await convertInventoryReservations(context,'11111111-1111-4111-8111-111111111111')).idempotent,true);
    assert.deepEqual(calls.map(c=>new URL(c.url).pathname.split('/').pop()),['reserve_order_inventory','release_order_inventory','convert_order_inventory']);
  } finally { restore(); }
});

test('missing atomic RPC fails closed with operational error', async () => {
  const restore=installFetch(async ()=>response({message:'Could not find the function public.reserve_order_inventory in the schema cache'},404));
  try {
    await assert.rejects(
      reserveInventoryForOrder({env},'11111111-1111-4111-8111-111111111111',[{product_slug:'beauty-of-joseon-relief-sun-spf50',quantity:1}]),
      (error)=>error.code==='INVENTORY_ATOMIC_RPC_MISSING' && error.status===503
    );
  } finally { restore(); }
});

class AtomicInventoryMock {
  constructor(stock){this.stock=stock;this.reserved=0;this.orders=new Map();this.lock=Promise.resolve();}
  async serial(fn){const before=this.lock;let release;this.lock=new Promise(r=>release=r);await before;try{return await fn();}finally{release();}}
  reserve(orderId,qty){return this.serial(()=>{if(this.orders.has(orderId))return {ok:true,idempotent:true};if(this.stock-this.reserved<qty)return {ok:false,code:'INSUFFICIENT_STOCK'};this.reserved+=qty;this.orders.set(orderId,{qty,status:'active'});return {ok:true,idempotent:false};});}
  convert(orderId){return this.serial(()=>{const row=this.orders.get(orderId);if(!row||row.status==='converted')return {ok:true,idempotent:true};if(row.status!=='active')return {ok:false};this.stock-=row.qty;this.reserved-=row.qty;row.status='converted';return {ok:true,idempotent:false};});}
  release(orderId){return this.serial(()=>{const row=this.orders.get(orderId);if(!row||row.status==='released')return {ok:true,idempotent:true};if(row.status!=='active')return {ok:true,idempotent:true};this.reserved-=row.qty;row.status='released';return {ok:true,idempotent:false};});}
}

test('deterministic local concurrency model: two stock-one attempts yield one reservation', async () => {
  const inv=new AtomicInventoryMock(1);
  const [a,b]=await Promise.all([inv.reserve('order-a',1),inv.reserve('order-b',1)]);
  assert.equal([a,b].filter(x=>x.ok).length,1); assert.equal(inv.reserved,1); assert.equal(inv.stock,1);
  const successOrder=a.ok?'order-a':'order-b';
  assert.equal((await inv.convert(successOrder)).ok,true); assert.equal((await inv.convert(successOrder)).idempotent,true); assert.equal(inv.stock,0); assert.equal(inv.reserved,0);
  assert.equal((await inv.release(successOrder)).idempotent,true); assert.equal(inv.stock,0);
});

test('coupon API: valid free shipping, invalid and expired outcomes', async () => {
  const scenarios=[
    {code:'FREESHIP',coupon:{id:'c1',code:'FREESHIP',is_active:true,discount_type:'free_shipping',min_subtotal:0},status:200,free:true},
    {code:'BAD',coupon:null,status:404},
    {code:'EXPIRED',coupon:{id:'c2',code:'EXPIRED',is_active:true,discount_type:'fixed',discount_value:10,ends_at:'2020-01-01T00:00:00Z'},status:400}
  ];
  for(const scenario of scenarios){
    const restore=installFetch(async (url)=>{
      const u=String(url);
      if(u.includes('/rest/v1/coupons')) return response(scenario.coupon?[scenario.coupon]:[]);
      if(u.includes('/rest/v1/coupon_redemptions')) return response([]);
      return response([]);
    });
    try{
      const req=requestJson('https://local.test/api/coupons/validate',{code:scenario.code,cart:[{slug:'beauty-of-joseon-relief-sun-spf50',quantity:1}]});
      const res=await validateCoupon(contextFor(req)); const data=await res.json(); assert.equal(res.status,scenario.status); if(scenario.free) assert.equal(data.freeShipping,true);
    }finally{restore();}
  }
});

test('C1B1: exclusion-aware allocation gives excluded lines zero discount and v2 snapshots', () => {
  const cart = [
    { product_id: 'a', product_slug: 'prod-a', product_name: 'A', quantity: 1, unit_price: 600, line_total: 600, categorySlug: 'care', category: 'Nemlendiriciler', is_coupon_eligible: true },
    { product_id: 'b', product_slug: 'prod-b', product_name: 'B', quantity: 1, unit_price: 400, line_total: 400, categorySlug: 'protect', category: 'Güneş Koruyucular', is_coupon_eligible: false }
  ];
  const allocations = allocateOrderDiscountSnapshots(cart, 100, { eligibility: (row) => row.is_coupon_eligible === true });
  const paidA = allocations.find((r) => r.item.product_slug === 'prod-a')?.paidLineTotal;
  const paidB = allocations.find((r) => r.item.product_slug === 'prod-b')?.paidLineTotal;
  const allocB = allocations.find((r) => r.item.product_slug === 'prod-b')?.allocatedDiscount;
  assert.equal(paidA, 500);
  assert.equal(allocB, 0);
  assert.equal(paidB, 400);

  const snapshots = buildOrderItemPricingSnapshots(cart, 100, { version: PRICING_SNAPSHOT_VERSION_V2, eligibility: (row) => row.is_coupon_eligible === true });
  const snapA = snapshots.find((r) => r.product_slug === 'prod-a');
  const snapB = snapshots.find((r) => r.product_slug === 'prod-b');
  assert.equal(snapA.pricing_snapshot_version, PRICING_SNAPSHOT_VERSION_V2);
  assert.equal(snapB.pricing_snapshot_version, PRICING_SNAPSHOT_VERSION_V2);
  assert.equal(snapB.allocated_order_discount, 0);
  assert.equal(snapB.paid_line_total, 400);
});

test('C1B1: validate endpoint applies coupon only to eligible lines (slug + category exclusions)', async () => {
  const now = new Date().toISOString();
  const user = { id: 'user-1', email: 'qa.user@cosmoskin.invalid', created_at: now, email_confirmed_at: now, email_verified: true, user_metadata: {} };

  const coupon = {
    id: 'c-ex',
    code: 'EXCL10',
    is_active: true,
    discount_type: 'percent',
    discount_value: 10,
    min_subtotal: 0,
    max_discount_amount: 999,
    per_customer_limit: 1,
    excluded_product_slugs: ['anua-heartleaf-77-soothing-toner']
  };

  const restore = installFetch(async (url, options = {}) => {
    const href = String(url instanceof Request ? url.url : url);
    if (href.includes('/auth/v1/user')) return response(user);
    if (href.includes('/rest/v1/coupons')) return response([coupon]);
    if (href.includes('/rest/v1/coupon_redemptions')) return response([]);
    if (href.includes('/rest/v1/coupon_reservations')) return response([]);
    return response([]);
  });
  try {
    const req = requestJson('https://local.test/api/coupons/validate', {
      code: 'EXCL10',
      accessToken: 't',
      cart: [
        { slug: 'anua-heartleaf-77-soothing-toner', quantity: 1 },
        { slug: 'beauty-of-joseon-relief-sun-spf50', quantity: 1 }
      ]
    });
    const res = await validateCoupon(contextFor(req));
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.ok, true);
    // eligible line is Relief Sun (899) only -> 10% = 89.9
    assert.equal(data.discount_amount, 89.9);
  } finally { restore(); }

  const couponCat = {
    ...coupon,
    id: 'c-ex2',
    code: 'EXCLCAT',
    excluded_product_slugs: [],
    excluded_categories: ['protect']
  };
  const restore2 = installFetch(async (url, options = {}) => {
    const href = String(url instanceof Request ? url.url : url);
    if (href.includes('/auth/v1/user')) return response(user);
    if (href.includes('/rest/v1/coupons')) return response([couponCat]);
    if (href.includes('/rest/v1/coupon_redemptions')) return response([]);
    if (href.includes('/rest/v1/coupon_reservations')) return response([]);
    return response([]);
  });
  try {
    const req = requestJson('https://local.test/api/coupons/validate', {
      code: 'EXCLCAT',
      accessToken: 't',
      cart: [
        { slug: 'beauty-of-joseon-relief-sun-spf50', quantity: 1 } // categorySlug protect, excluded => all excluded
      ]
    });
    const res = await validateCoupon(contextFor(req));
    const data = await res.json();
    assert.equal(res.status, 400);
    assert.equal(data.reasonCode, 'category_excluded');
    assert.match(String(data.message || ''), /sepetinizdeki ürünler için uygun değil/i);
  } finally { restore2(); }
});

test('C1A: coupon eligibility is enforced server-side (tier, routine, first-order, reservations)', async () => {
  const now = new Date().toISOString();
  const baseUser = { id: 'user-1', email: '', created_at: now, email_confirmed_at: now, email_verified: true, user_metadata: {} };
  const couponRows = {
    WELCOME10: { id: 'c-welcome', code: 'WELCOME10', is_active: true, discount_type: 'percent', discount_value: 10, min_subtotal: 1000, max_discount_amount: 150, per_customer_limit: 1, metadata: { eligibility: { requires_auth: true, requires_first_order: true } } },
    ROUTINE5: { id: 'c-routine', code: 'ROUTINE5', is_active: true, discount_type: 'percent', discount_value: 5, min_subtotal: 1500, max_discount_amount: 100, per_customer_limit: 1, metadata: { eligibility: { requires_auth: true, requires_smart_routine: true } } },
    SIGNATURE75: { id: 'c-signature', code: 'SIGNATURE75', is_active: true, discount_type: 'amount', discount_value: 75, min_subtotal: 1500, max_discount_amount: 75, per_customer_limit: 1, metadata: { eligibility: { requires_auth: true, allowed_tiers: ['signature', 'elite'] } } },
    ELITE100: { id: 'c-elite', code: 'ELITE100', is_active: true, discount_type: 'amount', discount_value: 100, min_subtotal: 2000, max_discount_amount: 100, per_customer_limit: 1, metadata: { eligibility: { requires_auth: true, allowed_tiers: ['elite'] } } },
    BIRTHDAY10: { id: 'c-bday', code: 'BIRTHDAY10', is_active: true, discount_type: 'percent', discount_value: 10, min_subtotal: 1500, max_discount_amount: 150, per_customer_limit: 1, metadata: { eligibility: { requires_auth: true, requires_birthday_month: true } } },
    COSMOSKIN10: { id: 'c-dep', code: 'COSMOSKIN10', is_active: false, discount_type: 'percent', discount_value: 0, min_subtotal: 0, max_discount_amount: 0, per_customer_limit: 0, metadata: {} }
  };

  async function validate(code, { token = null, seed = {} } = {}) {
    const fake = createFakeSupabase(seed);
    const restore = installFetch(async (url, options = {}) => {
      const href = String(url instanceof Request ? url.url : url);
      if (href.includes('/auth/v1/user')) return response(token ? baseUser : null);
      if (href.includes('/rest/v1/coupons')) return response([couponRows[code]].filter(Boolean));
      return await fake.fetchHandler(url, options);
    });
    try {
      const req = requestJson('https://local.test/api/coupons/validate', { code, accessToken: token ? 'customer-token' : null, cart: [{ slug: 'beauty-of-joseon-relief-sun-spf50', quantity: 3 }] });
      const res = await validateCoupon(contextFor(req));
      const data = await res.json();
      return { res, data };
    } finally { restore(); }
  }

  // COSMOSKIN10 remains unusable.
  {
    const { res, data } = await validate('COSMOSKIN10', { token: 't' });
    assert.equal(res.status, 400);
    assert.equal(data.reasonCode, 'coupon_deprecated');
  }

  // ROUTINE5: guest rejected; authenticated without routine rejected.
  {
    const guest = await validate('ROUTINE5', { token: null, seed: { coupons: [couponRows.ROUTINE5] } });
    assert.equal(guest.res.status, 403);
    assert.equal(guest.data.reasonCode, 'authentication_required');
    const noRoutine = await validate('ROUTINE5', { token: 't', seed: { coupons: [couponRows.ROUTINE5], customer_routine_results: [] } });
    assert.equal(noRoutine.res.status, 403);
    assert.equal(noRoutine.data.reasonCode, 'smart_routine_required');
  }

  // ROUTINE5: trusted routine completion allows.
  {
    const ok = await validate('ROUTINE5', {
      token: 't',
      seed: {
        coupons: [couponRows.ROUTINE5],
        customer_routine_results: [{ id: 'rr-1', user_id: 'user-1', is_active: true, completed_at: now }]
      }
    });
    assert.equal(ok.res.status, 200);
    assert.equal(ok.data.ok, true);
  }

  // ELITE100: Essential blocked, Elite allowed.
  {
    const essential = await validate('ELITE100', {
      token: 't',
      seed: {
        coupons: [couponRows.ELITE100],
        customer_membership_status: [{ id: 'ms-1', user_id: 'user-1', level_code: 'essential' }]
      }
    });
    assert.equal(essential.res.status, 403);
    assert.equal(essential.data.reasonCode, 'membership_tier_not_allowed');

    const elite = await validate('ELITE100', {
      token: 't',
      seed: {
        coupons: [couponRows.ELITE100],
        customer_membership_status: [{ id: 'ms-1', user_id: 'user-1', level_code: 'elite' }]
      }
    });
    assert.equal(elite.res.status, 200);
    assert.equal(elite.data.ok, true);
  }

  // SIGNATURE75: Signature and Elite allowed; Essential blocked.
  {
    const signature = await validate('SIGNATURE75', {
      token: 't',
      seed: {
        coupons: [couponRows.SIGNATURE75],
        customer_membership_status: [{ id: 'ms-1', user_id: 'user-1', level_code: 'signature' }]
      }
    });
    assert.equal(signature.res.status, 200);

    const elite = await validate('SIGNATURE75', {
      token: 't',
      seed: {
        coupons: [couponRows.SIGNATURE75],
        customer_membership_status: [{ id: 'ms-1', user_id: 'user-1', level_code: 'elite' }]
      }
    });
    assert.equal(elite.res.status, 200);

    const essential = await validate('SIGNATURE75', {
      token: 't',
      seed: {
        coupons: [couponRows.SIGNATURE75],
        customer_membership_status: [{ id: 'ms-1', user_id: 'user-1', level_code: 'essential' }]
      }
    });
    assert.equal(essential.res.status, 403);
    assert.equal(essential.data.reasonCode, 'membership_tier_not_allowed');
  }

  // WELCOME10: second use blocked by active reserved redemption.
  {
    const reserved = await validate('WELCOME10', {
      token: 't',
      seed: {
        coupons: [couponRows.WELCOME10],
        orders: [],
        coupon_redemptions: [{ id: 'cr-1', code: 'WELCOME10', user_id: 'user-1', status: 'reserved', created_at: now }]
      }
    });
    assert.equal(reserved.res.status, 400);
    assert.equal(reserved.data.reasonCode, 'per_customer_limit_reached');
  }

  // BIRTHDAY10: missing birthday fails closed.
  {
    const missing = await validate('BIRTHDAY10', { token: 't', seed: { coupons: [couponRows.BIRTHDAY10], profiles: [{ id: 'user-1', birthday: null }] } });
    assert.equal(missing.res.status, 403);
    assert.equal(missing.data.reasonCode, 'birthday_month_required');
  }
});

test('C1B2: admin coupon metadata visibility, sanitization, and checkout protections', async () => {
  const welcomeRow = {
    id: 'c-welcome',
    code: 'WELCOME10',
    title: 'Hoş geldin',
    is_active: true,
    type: 'percent',
    value: 9,
    discount_type: 'percent',
    discount_value: 10,
    min_subtotal: 1000,
    max_discount: 140,
    max_discount_amount: 150,
    per_customer_limit: 1,
    metadata: {
      scope: 'launch',
      eligibility: { requires_auth: true, requires_first_order: true, allowed_tiers: ['essential'] }
    },
    excluded_product_slugs: [' Alpha ', 'alpha'],
    excluded_categories: ['Cleanse', 'cleanse']
  };

  const presentation = resolveCouponPresentation(welcomeRow);
  assert.equal(presentation.canonical.coupon_type, 'percent');
  assert.equal(presentation.canonical.coupon_value, 10);
  assert.equal(presentation.canonical.coupon_max_discount, 150);
  assert.equal(presentation.field_conflicts.has_conflict, true);
  assert.match(presentation.field_conflicts.warning, /Checkout kanonik alanı kullanır/);
  assert.equal(presentation.rule_source, 'metadata');
  assert.equal(presentation.rule_source_label, 'Kural kaynağı: metadata');
  assert.equal(presentation.eligibility.requires_auth, true);
  assert.equal(presentation.eligibility.requires_first_order, true);
  assert.deepEqual(presentation.excluded_product_slugs, ['alpha']);
  assert.deepEqual(presentation.excluded_categories, ['cleanse']);

  const routinePresentation = resolveCouponPresentation({
    code: 'ROUTINE5',
    is_active: true,
    discount_type: 'percent',
    discount_value: 5,
    metadata: {}
  });
  assert.equal(routinePresentation.rule_source, 'system_default');
  assert.equal(routinePresentation.rule_source_label, 'Kural kaynağı: sistem varsayılanı');
  assert.equal(routinePresentation.eligibility.requires_smart_routine, true);

  const invalidTiers = sanitizeEligibilityMetadataPatch(
    { scope: 'launch', extra: { keep: true }, eligibility: { allowed_tiers: ['signature'] } },
    { allowed_tiers: ['vip'] }
  );
  assert.equal(invalidTiers.ok, false);

  const merged = sanitizeEligibilityMetadataPatch(
    { scope: 'launch', extra: { keep: true }, eligibility: { allowed_tiers: ['signature'] } },
    { requires_auth: true, allowed_tiers: ['elite'], requires_birthday: true }
  );
  assert.equal(merged.ok, true);
  assert.equal(merged.metadata.scope, 'launch');
  assert.equal(merged.metadata.extra.keep, true);
  assert.deepEqual(merged.metadata.eligibility.allowed_tiers, ['elite']);
  assert.equal(merged.metadata.eligibility.requires_birthday_month, true);

  assert.deepEqual(normalizeExclusionList([' A ', 'a', '', 'b']), ['a', 'b']);

  const patchPayload = buildCouponPatchPayload({
    eligibility: { allowed_tiers: ['signature'] },
    excluded_product_slugs: ['Slug-A', 'slug-a'],
    excluded_categories: ['Treat', 'treat']
  }, welcomeRow);
  assert.equal(patchPayload.errors.length, 0);
  assert.deepEqual(patchPayload.payload.excluded_product_slugs, ['slug-a']);
  assert.deepEqual(patchPayload.payload.excluded_categories, ['treat']);
  assert.deepEqual(patchPayload.payload.metadata.eligibility.allowed_tiers, ['signature']);

  const adminEnv = {
    ADMIN_TOKEN: 'a'.repeat(64),
    ADMIN_ALLOW_LEGACY_TOKEN: 'true',
    SUPABASE_URL: env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY
  };
  const { fake, restore } = await installFakeSupabaseWithAdmin({
    coupons: [welcomeRow],
    coupon_redemptions: [
      { id: 'r-1', code: 'WELCOME10', status: 'used', created_at: '2026-01-02T10:00:00.000Z', used_at: '2026-01-02T10:05:00.000Z' },
      { id: 'r-2', code: 'WELCOME10', status: 'reserved', created_at: '2026-02-02T10:00:00.000Z' }
    ]
  });

  try {
    const adminHeaders = {
      'x-admin-token': 'a'.repeat(64),
      'CF-Connecting-IP': '192.0.2.55',
      'Cf-Access-Authenticated-User-Email': 'cankolsun@gmail.com'
    };
    const getReq = new Request('https://local.test/api/admin/coupons', { headers: adminHeaders });
    const getRes = await adminCouponsGet({ request: getReq, env: adminEnv });
    const getData = await getRes.json();
    assert.equal(getRes.status, 200);
    assert.equal(getData.ok, true);
    const adminCoupon = getData.coupons[0];
    assert.equal(adminCoupon.admin.code, 'WELCOME10');
    assert.equal(adminCoupon.admin.usage.total_used_count, 1);
    assert.equal(adminCoupon.admin.usage.active_reserved_count, 1);
    assert.ok(adminCoupon.admin.usage.last_used_at);

    const badPatchReq = new Request('https://local.test/api/admin/coupons', {
      method: 'PATCH',
      headers: {
        ...adminHeaders,
        'content-type': 'application/json',
        'CF-Connecting-IP': '192.0.2.56'
      },
      body: JSON.stringify({ id: 'c-welcome', eligibility: { allowed_tiers: ['platinum'] } })
    });
    const badPatchRes = await adminCouponsPatch({ request: badPatchReq, env: adminEnv });
    const badPatchData = await badPatchRes.json();
    assert.equal(badPatchRes.status, 400);
    assert.equal(badPatchData.ok, false);

    const goodPatchReq = new Request('https://local.test/api/admin/coupons', {
      method: 'PATCH',
      headers: {
        ...adminHeaders,
        'content-type': 'application/json',
        'CF-Connecting-IP': '192.0.2.57'
      },
      body: JSON.stringify({
        id: 'c-welcome',
        eligibility: { allowed_tiers: ['signature', 'elite'], requires_smart_routine: false },
        excluded_categories: ['masks']
      })
    });
    const goodPatchRes = await adminCouponsPatch({ request: goodPatchReq, env: adminEnv });
    const goodPatchData = await goodPatchRes.json();
    assert.equal(goodPatchRes.status, 200);
    assert.deepEqual(goodPatchData.coupon.metadata.eligibility.allowed_tiers, ['signature', 'elite']);
    assert.equal(goodPatchData.coupon.metadata.scope, 'launch');
    assert.deepEqual(goodPatchData.coupon.excluded_categories, ['masks']);

    const updatedRow = fake.table('coupons').find((row) => row.id === 'c-welcome');
    assert.equal(updatedRow.metadata.scope, 'launch');
    assert.deepEqual(updatedRow.metadata.eligibility.allowed_tiers, ['signature', 'elite']);
  } finally {
    restore();
  }

  // Checkout still rejects unauthorized coupon use (ELITE100 essential tier).
  const eliteBlocked = await (async () => {
    const couponRows = {
      ELITE100: { id: 'c-elite', code: 'ELITE100', is_active: true, discount_type: 'amount', discount_value: 100, min_subtotal: 2000, max_discount_amount: 100, per_customer_limit: 1, metadata: { eligibility: { requires_auth: true, allowed_tiers: ['elite'] } } }
    };
    const fake2 = createFakeSupabase({ coupons: [couponRows.ELITE100], customer_membership_status: [{ id: 'ms-1', user_id: 'user-1', level_code: 'essential' }] });
    const restore2 = installFetch(async (url, options = {}) => {
      const href = String(url instanceof Request ? url.url : url);
      if (href.includes('/auth/v1/user')) return response({ id: 'user-1', email: 'buyer@example.com', created_at: new Date().toISOString(), email_confirmed_at: new Date().toISOString(), email_verified: true });
      if (href.includes('/rest/v1/coupons')) return response([couponRows.ELITE100]);
      return await fake2.fetchHandler(url, options);
    });
    try {
      const req = requestJson('https://local.test/api/coupons/validate', { code: 'ELITE100', accessToken: 'customer-token', cart: [{ slug: 'beauty-of-joseon-relief-sun-spf50', quantity: 3 }] });
      const res = await validateCoupon(contextFor(req));
      return { res, data: await res.json() };
    } finally { restore2(); }
  })();
  assert.equal(eliteBlocked.res.status, 403);
  assert.equal(eliteBlocked.data.reasonCode, 'membership_tier_not_allowed');
});

test('checkout blocks missing EFT bank account before inventory reservation or order creation', async () => {
  const calls=[];
  const restore=installFetch(async (url)=>{calls.push(String(url)); if(String(url).includes('/rest/v1/payment_bank_accounts')) return response([]); return response([]);});
  try{
    const req=requestJson('https://local.test/api/create-checkout',{payment_method:'bank_transfer',idempotency_key:'local-missing-bank-0001',cart:[{slug:'beauty-of-joseon-relief-sun-spf50',quantity:1}],customer:validCustomer});
    const res=await createCheckout(contextFor(req)); const data=await res.json();
    assert.equal(res.status,503); assert.equal(data.code,'BANK_ACCOUNT_NOT_CONFIGURED');
    assert.equal(calls.some((url)=>url.includes('/rpc/reserve_order_inventory')),false);
    assert.equal(calls.some((url)=>url.includes('/rest/v1/orders')),false);
  }finally{restore();}
});

test('admin signed session is accepted and raw legacy token is disabled by default', async () => {
  const adminEnv={ADMIN_TOKEN:'a'.repeat(64),ADMIN_SESSION_SECRET:'b'.repeat(64),ADMIN_ALLOW_LEGACY_TOKEN:'false', SUPABASE_URL: env.SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY};
  const restore = installAdminUsersFetch({ id: '1', email: 'owner@cosmoskin.com.tr', role: 'owner', role_code: 'owner', permissions: ['*'], is_active: true, status: 'active' });
  try {
    const issueRequest=new Request('https://local.test/api/admin/session',{method:'POST',headers:{'x-admin-token':adminEnv.ADMIN_TOKEN,'CF-Connecting-IP':'192.0.2.10','Cf-Access-Authenticated-User-Email':'owner@cosmoskin.com.tr'}});
    const issued=await issueAdminSession({request:issueRequest,env:adminEnv});
    assert.match(issued.token,/^v1\./);
    assert.equal(issued.token.split('.').length, 5);
    assert.equal(issued.email, 'owner@cosmoskin.com.tr');
    const signedRequest=new Request('https://local.test/api/admin/orders',{headers:{'x-admin-token':issued.token,'CF-Connecting-IP':'192.0.2.10'}});
    assert.equal(await assertAdmin({request:signedRequest,env:adminEnv}),true);
    const rawRequest=new Request('https://local.test/api/admin/orders',{headers:{'x-admin-token':adminEnv.ADMIN_TOKEN,'CF-Connecting-IP':'192.0.2.11'}});
    await assert.rejects(assertAdmin({request:rawRequest,env:adminEnv}),/yetkilendirmesi/i);
  } finally { restore(); }
});

test('unauthorized admin mutation is rejected server-side before database access', async () => {
  let fetchCount=0; const restore=installFetch(async()=>{fetchCount++;return response([])});
  try{
    const req=new Request('https://local.test/api/admin/orders/1/status',{method:'PATCH',headers:{'content-type':'application/json','x-admin-token':'wrong','CF-Connecting-IP':'192.0.2.12'},body:JSON.stringify({status:'paid'})});
    const res=await adminStatusPatch({request:req,env:{ADMIN_TOKEN:'a'.repeat(64),ADMIN_SESSION_SECRET:'b'.repeat(64),ADMIN_ALLOW_LEGACY_TOKEN:'false'},params:{id:'1'}});
    assert.equal(res.status,401); assert.equal(fetchCount,0);
  }finally{restore();}
});

function installAdminUsersFetch(row) {
  return installFetch(async (url) => {
    const href = String(url instanceof Request ? url.url : url);
    if (href.includes('/rest/v1/admin_users')) return response(row ? [row] : []);
    if (href.includes('/rest/v1/admin_permissions')) return response([]);
    return response([]);
  });
}
function ctxWithAccessEmail(email) {
  const headers = { 'CF-Connecting-IP': '192.0.2.20' };
  if (email) headers['Cf-Access-Authenticated-User-Email'] = email;
  return contextFor(new Request('https://local.test/api/admin/loyalty/adjust-points', { headers }));
}

test('A1: hasAdminPermission denies by default when no admin_users row matches (no allow-all bypass)', async () => {
  const restore = installAdminUsersFetch(null);
  try {
    assert.equal(await hasAdminPermission(ctxWithAccessEmail('unknown@example.com'), 'orders:read'), false);
    assert.equal(await hasAdminPermission(ctxWithAccessEmail(null), 'orders:read'), false);
  } finally { restore(); }
});

test('A1: hasAdminPermission denies an inactive or disabled admin regardless of role', async () => {
  const restoreInactive = installAdminUsersFetch({ id: '1', email: 'ops@cosmoskin.com.tr', role: 'operations', role_code: 'operations', permissions: [], is_active: false, status: 'active' });
  try { assert.equal(await hasAdminPermission(ctxWithAccessEmail('ops@cosmoskin.com.tr'), 'orders:read'), false); } finally { restoreInactive(); }
  const restoreDisabled = installAdminUsersFetch({ id: '1', email: 'ops@cosmoskin.com.tr', role: 'operations', role_code: 'operations', permissions: [], is_active: true, status: 'disabled' });
  try { assert.equal(await hasAdminPermission(ctxWithAccessEmail('ops@cosmoskin.com.tr'), 'orders:read'), false); } finally { restoreDisabled(); }
});

test('A1: owner permissions [\'*\'] pass every permission check after the deny-by-default flip', async () => {
  const restore = installAdminUsersFetch({ id: '1', email: 'cankolsun@gmail.com', role: 'owner', role_code: 'owner', permissions: ['*'], is_active: true, status: 'active' });
  try {
    assert.equal(await hasAdminPermission(ctxWithAccessEmail('cankolsun@gmail.com'), 'loyalty:adjust'), true);
    assert.equal(await hasAdminPermission(ctxWithAccessEmail('cankolsun@gmail.com'), 'admin.users.manage'), true);
    assert.equal(await hasAdminPermission(ctxWithAccessEmail('cankolsun@gmail.com'), 'anything:not_seeded'), true);
  } finally { restore(); }
});

test('A1: client-supplied is_admin/role/permissions body fields cannot grant admin access', async () => {
  const restore = installAdminUsersFetch(null);
  try {
    const forged = ctxWithAccessEmail('attacker@example.com');
    forged.request = new Request('https://local.test/api/admin/loyalty/adjust-points', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Cf-Access-Authenticated-User-Email': 'attacker@example.com' },
      body: JSON.stringify({ is_admin: true, role: 'owner', role_code: 'owner', permissions: ['*'] })
    });
    assert.equal(await hasAdminPermission(forged, 'loyalty:adjust'), false);
  } finally { restore(); }
});

test('A1: admin/users.js mutation requires admin.users.manage (or owner) — ADMIN_TOKEN alone is not enough', async () => {
  const adminEnv = { ADMIN_TOKEN: 'a'.repeat(64), ADMIN_SESSION_SECRET: 'b'.repeat(64), ADMIN_ALLOW_LEGACY_TOKEN: 'false', SUPABASE_URL: env.SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY };
  const restoreIssueOwner = installAdminUsersFetch({ id: '1', email: 'cankolsun@gmail.com', role: 'owner', role_code: 'owner', permissions: ['*'], is_active: true, status: 'active' });
  let issued;
  try {
    const issueRequest = new Request('https://local.test/api/admin/session', { method: 'POST', headers: { 'x-admin-token': adminEnv.ADMIN_TOKEN, 'CF-Connecting-IP': '192.0.2.21', 'Cf-Access-Authenticated-User-Email': 'cankolsun@gmail.com' } });
    issued = await issueAdminSession({ request: issueRequest, env: adminEnv });
  } finally { restoreIssueOwner(); }

  const restoreNoMatch = installAdminUsersFetch(null);
  try {
    const req = new Request('https://local.test/api/admin/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-token': issued.token, 'CF-Connecting-IP': '192.0.2.21' },
      body: JSON.stringify({ email: 'new-admin@cosmoskin.com.tr', role: 'owner' })
    });
    const res = await adminUsersPost({ request: req, env: adminEnv, params: {} });
    assert.equal(res.status, 403);
  } finally { restoreNoMatch(); }

  const restoreOwner = installFetch(async (url, init) => {
    const href = String(url instanceof Request ? url.url : url);
    if (href.includes('/rest/v1/admin_users') && (!init || init.method === undefined || init.method === 'GET')) {
      return response([{ id: '1', email: 'cankolsun@gmail.com', role: 'owner', role_code: 'owner', permissions: ['*'], is_active: true, status: 'active' }]);
    }
    if (href.includes('/rest/v1/admin_users')) return response([{ id: '2', email: 'new-admin@cosmoskin.com.tr', role: 'operations' }]);
    return response([]);
  });
  try {
    const req = new Request('https://local.test/api/admin/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-token': issued.token, 'CF-Connecting-IP': '192.0.2.21', 'Cf-Access-Authenticated-User-Email': 'cankolsun@gmail.com' },
      body: JSON.stringify({ email: 'new-admin@cosmoskin.com.tr', role: 'operations' })
    });
    const res = await adminUsersPost({ request: req, env: adminEnv, params: {} });
    assert.equal(res.status, 200);
  } finally { restoreOwner(); }
});

// ---------------------------------------------------------------------------
// A1.2a: admin GET/read endpoint permission coverage. Shared parametrized
// helper reused across all 13 gated endpoints instead of hand-writing near-
// duplicate tests per file.
// ---------------------------------------------------------------------------
function adminReadEnv() {
  return { ADMIN_TOKEN: 'a'.repeat(64), ADMIN_ALLOW_LEGACY_TOKEN: 'true', SUPABASE_URL: env.SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY };
}
function adminReadRequest(url, email) {
  const headers = { 'x-admin-token': 'a'.repeat(64), 'CF-Connecting-IP': '192.0.2.30' };
  if (email) headers['Cf-Access-Authenticated-User-Email'] = email;
  return new Request(url, { headers });
}
const A1_2A_READ_ENDPOINTS = [
  { label: 'admin/orders.js', permission: 'orders:read', handler: adminOrdersGet, url: 'https://local.test/api/admin/orders', params: {} },
  { label: 'admin/orders/[id].js', permission: 'orders:read', handler: adminOrderDetailGet, url: 'https://local.test/api/admin/orders/order-1', params: { id: 'order-1' } },
  { label: 'admin/returns.js', permission: 'returns:read', handler: adminReturnsGet, url: 'https://local.test/api/admin/returns', params: {} },
  { label: 'admin/customers.js', permission: 'customers:read', handler: adminCustomersGet, url: 'https://local.test/api/admin/customers', params: {} },
  { label: 'admin/products.js', permission: 'products:read', handler: adminProductsGet, url: 'https://local.test/api/admin/products', params: {} },
  { label: 'admin/inventory.js', permission: 'inventory:read', handler: adminInventoryGet, url: 'https://local.test/api/admin/inventory', params: {} },
  { label: 'admin/inventory/[slug]/movements.js', permission: 'inventory:read', handler: adminInventoryMovementsGet, url: 'https://local.test/api/admin/inventory/test-slug/movements', params: { slug: 'test-slug' } },
  { label: 'admin/lots.js', permission: 'lots:read', handler: adminLotsGet, url: 'https://local.test/api/admin/lots', params: {} },
  { label: 'admin/suppliers.js', permission: 'suppliers:read', handler: adminSuppliersGet, url: 'https://local.test/api/admin/suppliers', params: {} },
  { label: 'admin/compliance.js', permission: 'compliance:read', handler: adminComplianceGet, url: 'https://local.test/api/admin/compliance', params: {} },
  { label: 'admin/coupons/index.js', permission: 'coupons:read', handler: adminCouponsGet, url: 'https://local.test/api/admin/coupons', params: {} },
  { label: 'admin/shipments.js', permission: 'shipments:read', handler: adminShipmentsGet, url: 'https://local.test/api/admin/shipments', params: {} },
  { label: 'admin/email-logs.js', permission: 'email_logs:read', handler: adminEmailLogsGet, url: 'https://local.test/api/admin/email-logs', params: {} }
];

test('A1.2a: every gated GET/read admin endpoint denies an assertAdmin()-valid caller with no matching admin_users row (403)', async () => {
  const restore = installAdminUsersFetch(null);
  try {
    for (const { label, handler, url, params } of A1_2A_READ_ENDPOINTS) {
      const res = await handler({ request: adminReadRequest(url, 'unknown@example.com'), env: adminReadEnv(), params });
      assert.equal(res.status, 403, `${label}: expected 403 for a caller with no matching admin_users row, got ${res.status}`);
    }
  } finally { restore(); }
});

test('A1.2a: every gated GET/read admin endpoint lets the seeded owner (permissions [\'*\']) through the new permission gate', async () => {
  const restore = installAdminUsersFetch({ id: '1', email: 'cankolsun@gmail.com', role: 'owner', role_code: 'owner', permissions: ['*'], is_active: true, status: 'active' });
  try {
    for (const { label, handler, url, params } of A1_2A_READ_ENDPOINTS) {
      const res = await handler({ request: adminReadRequest(url, 'cankolsun@gmail.com'), env: adminReadEnv(), params });
      assert.notEqual(res.status, 403, `${label}: owner must not be blocked by the new permission gate, got ${res.status}`);
    }
  } finally { restore(); }
});

test('A1.2a: an inactive or disabled admin is still denied on a gated read endpoint, even with the right role', async () => {
  const restoreInactive = installAdminUsersFetch({ id: '2', email: 'ops@cosmoskin.com.tr', role: 'operations', role_code: 'operations', permissions: ['orders:read'], is_active: false, status: 'active' });
  try {
    const res = await adminOrdersGet({ request: adminReadRequest('https://local.test/api/admin/orders', 'ops@cosmoskin.com.tr'), env: adminReadEnv(), params: {} });
    assert.equal(res.status, 403);
  } finally { restoreInactive(); }
  const restoreDisabled = installAdminUsersFetch({ id: '2', email: 'ops@cosmoskin.com.tr', role: 'operations', role_code: 'operations', permissions: ['orders:read'], is_active: true, status: 'disabled' });
  try {
    const res = await adminOrdersGet({ request: adminReadRequest('https://local.test/api/admin/orders', 'ops@cosmoskin.com.tr'), env: adminReadEnv(), params: {} });
    assert.equal(res.status, 403);
  } finally { restoreDisabled(); }
});

test('A1.2a: a caller whose only permission is unrelated cannot pass a differently-named read gate', async () => {
  const restore = installAdminUsersFetch({ id: '3', email: 'warehouse@cosmoskin.com.tr', role: 'warehouse', role_code: 'warehouse', permissions: ['inventory:read'], is_active: true, status: 'active' });
  try {
    const res = await adminReturnsGet({ request: adminReadRequest('https://local.test/api/admin/returns', 'warehouse@cosmoskin.com.tr'), env: adminReadEnv(), params: {} });
    assert.equal(res.status, 403, 'a warehouse-role caller holding only inventory:read must not pass the returns:read gate');
  } finally { restore(); }
});

test('A1.2a/A1.2b: mutation handlers sharing a file with a gated GET carry only their own (mutation) permission, never the GET one', async () => {
  function handlerBody(src, name) {
    const start = src.indexOf(`export async function ${name}`);
    if (start === -1) return '';
    const next = src.indexOf('\nexport ', start + 1);
    return src.slice(start, next === -1 ? undefined : next);
  }
  const filesWithMutationPermission = {
    orders: { src: await fs.readFile(path.join(root, 'functions/api/admin/orders.js'), 'utf8'), handlers: { onRequestPatch: 'orders:update' } },
    returns: { src: await fs.readFile(path.join(root, 'functions/api/admin/returns.js'), 'utf8'), handlers: { onRequestPatch: 'returns:update' } },
    products: { src: await fs.readFile(path.join(root, 'functions/api/admin/products.js'), 'utf8'), handlers: { onRequestPatch: 'inventory:adjust', onRequestPost: 'inventory:adjust' } },
    lots: { src: await fs.readFile(path.join(root, 'functions/api/admin/lots.js'), 'utf8'), handlers: { onRequestPost: 'inventory:adjust', onRequestPatch: 'inventory:adjust' } },
    suppliers: { src: await fs.readFile(path.join(root, 'functions/api/admin/suppliers.js'), 'utf8'), handlers: { onRequestPost: 'suppliers:manage', onRequestPatch: 'suppliers:manage' } },
    compliance: { src: await fs.readFile(path.join(root, 'functions/api/admin/compliance.js'), 'utf8'), handlers: { onRequestPatch: 'products:update' } },
    coupons: { src: await fs.readFile(path.join(root, 'functions/api/admin/coupons/index.js'), 'utf8'), handlers: { onRequestPost: 'coupons:manage', onRequestPatch: 'coupons:manage' } }
  };
  for (const [name, { src, handlers }] of Object.entries(filesWithMutationPermission)) {
    for (const [handlerName, expectedPermission] of Object.entries(handlers)) {
      const body = handlerBody(src, handlerName);
      assert.ok(body, `${name}.js: ${handlerName} not found`);
      assert.match(body, /assertAdmin\(context\)/, `${name}.js ${handlerName}: assertAdmin must remain present`);
      const calls = Array.from(body.matchAll(/requireAdminPermission\(context,\s*['"]([a-zA-Z_]+:[a-zA-Z_]+)['"]\)/g)).map((m) => m[1]);
      assert.deepEqual(calls, [expectedPermission], `${name}.js ${handlerName}: must call requireAdminPermission with exactly its own mutation permission '${expectedPermission}', not the file's GET/read permission`);
    }
  }
});

test('A1.2c: the deliberate escape-hatch routes remain untouched (dashboard.js, inventory/health.js)', async () => {
  const escapeHatches = {
    dashboard: await fs.readFile(path.join(root, 'functions/api/admin/dashboard.js'), 'utf8'),
    inventoryHealth: await fs.readFile(path.join(root, 'functions/api/admin/inventory/health.js'), 'utf8')
  };
  for (const [name, source] of Object.entries(escapeHatches)) {
    assert.doesNotMatch(source, /requireAdminPermission/, `${name}: must remain the deliberate assertAdmin-only escape hatch — must not gain a requireAdminPermission(...) call`);
    assert.match(source, /assertAdmin\(context\)/, `${name}: must remain assertAdmin-gated`);
  }
});

// ---------------------------------------------------------------------------
// A1.2b: admin mutation endpoint permission coverage. Shared parametrized
// helper reused across all 16 gated mutation handlers instead of hand-writing
// near-duplicate tests per file.
// ---------------------------------------------------------------------------
function adminMutationRequest(url, method, email, body = {}) {
  const headers = { 'x-admin-token': 'a'.repeat(64), 'CF-Connecting-IP': '192.0.2.31', 'content-type': 'application/json' };
  if (email) headers['Cf-Access-Authenticated-User-Email'] = email;
  return new Request(url, { method, headers, body: JSON.stringify(body) });
}
const A1_2B_MUTATION_ENDPOINTS = [
  { label: 'admin/orders.js PATCH', permission: 'orders:update', handler: adminOrdersPatch, method: 'PATCH', url: 'https://local.test/api/admin/orders', params: {}, body: { id: 'order-1', status: 'preparing' } },
  { label: 'admin/orders/[id]/status.js PATCH', permission: 'orders:update', handler: adminStatusPatch, method: 'PATCH', url: 'https://local.test/api/admin/orders/order-1/status', params: { id: 'order-1' }, body: { status: 'preparing' } },
  { label: 'admin/orders/[id]/emails.js POST', permission: 'orders:update', handler: adminOrderEmailsPost, method: 'POST', url: 'https://local.test/api/admin/orders/order-1/emails', params: { id: 'order-1' }, body: { email_type: 'order_created' } },
  { label: 'admin/orders/[id]/shipments.js POST', permission: 'shipments:create', handler: adminOrderShipmentsPost, method: 'POST', url: 'https://local.test/api/admin/orders/order-1/shipments', params: { id: 'order-1' }, body: { carrier: 'DHL', tracking_number: '123' } },
  { label: 'admin/returns.js PATCH', permission: 'returns:update', handler: adminReturnsPatch, method: 'PATCH', url: 'https://local.test/api/admin/returns', params: {}, body: { id: 'ret-1', status: 'approved' } },
  { label: 'admin/products.js PATCH', permission: 'inventory:adjust', handler: adminProductsPatch, method: 'PATCH', url: 'https://local.test/api/admin/products', params: {}, body: { product_slug: 'test-slug', stock_qty: 5 } },
  { label: 'admin/products.js POST', permission: 'inventory:adjust', handler: adminProductsPost, method: 'POST', url: 'https://local.test/api/admin/products', params: {}, body: { product_slug: 'test-slug' } },
  { label: 'admin/inventory/adjust.js POST', permission: 'inventory:adjust', handler: adminInventoryAdjustPost, method: 'POST', url: 'https://local.test/api/admin/inventory/adjust', params: {}, body: { product_slug: 'test-slug', quantity: 1 } },
  { label: 'admin/inventory/[slug].js PATCH', permission: 'inventory:adjust', handler: adminInventorySlugPatch, method: 'PATCH', url: 'https://local.test/api/admin/inventory/test-slug', params: { slug: 'test-slug' }, body: { stock_on_hand: 5 } },
  { label: 'admin/lots.js POST', permission: 'inventory:adjust', handler: adminLotsPost, method: 'POST', url: 'https://local.test/api/admin/lots', params: {}, body: { product_slug: 'test-slug', quantity: 1 } },
  { label: 'admin/lots.js PATCH', permission: 'inventory:adjust', handler: adminLotsPatch, method: 'PATCH', url: 'https://local.test/api/admin/lots', params: {}, body: { id: 'lot-1' } },
  { label: 'admin/suppliers.js POST', permission: 'suppliers:manage', handler: adminSuppliersPost, method: 'POST', url: 'https://local.test/api/admin/suppliers', params: {}, body: { name: 'Test Tedarikçi' } },
  { label: 'admin/suppliers.js PATCH', permission: 'suppliers:manage', handler: adminSuppliersPatch, method: 'PATCH', url: 'https://local.test/api/admin/suppliers', params: {}, body: { id: 'sup-1', name: 'Test Tedarikçi' } },
  { label: 'admin/compliance.js PATCH', permission: 'products:update', handler: adminCompliancePatch, method: 'PATCH', url: 'https://local.test/api/admin/compliance', params: {}, body: { product_slug: 'test-slug' } },
  { label: 'admin/coupons/index.js POST', permission: 'coupons:manage', handler: adminCouponsPost, method: 'POST', url: 'https://local.test/api/admin/coupons', params: {}, body: { code: 'TEST10' } },
  { label: 'admin/coupons/index.js PATCH', permission: 'coupons:manage', handler: adminCouponsPatch, method: 'PATCH', url: 'https://local.test/api/admin/coupons', params: {}, body: { id: 'cp-1' } }
];

test('A1.2b: every gated mutation admin endpoint denies an assertAdmin()-valid caller with no matching admin_users row (403)', async () => {
  const restore = installAdminUsersFetch(null);
  try {
    for (const { label, handler, method, url, params, body } of A1_2B_MUTATION_ENDPOINTS) {
      const res = await handler({ request: adminMutationRequest(url, method, 'unknown@example.com', body), env: adminReadEnv(), params });
      assert.equal(res.status, 403, `${label}: expected 403 for a caller with no matching admin_users row, got ${res.status}`);
    }
  } finally { restore(); }
});

test('A1.2b: every gated mutation admin endpoint lets the seeded owner (permissions [\'*\']) through the new permission gate', async () => {
  const restore = installAdminUsersFetch({ id: '1', email: 'cankolsun@gmail.com', role: 'owner', role_code: 'owner', permissions: ['*'], is_active: true, status: 'active' });
  try {
    for (const { label, handler, method, url, params, body } of A1_2B_MUTATION_ENDPOINTS) {
      const res = await handler({ request: adminMutationRequest(url, method, 'cankolsun@gmail.com', body), env: adminReadEnv(), params });
      assert.notEqual(res.status, 403, `${label}: owner must not be blocked by the new permission gate, got ${res.status}`);
    }
  } finally { restore(); }
});

test('A1.2b: a caller holding only the file\'s read permission cannot perform the mutation (read does not imply write)', async () => {
  const cases = [
    { readOnlyPermission: 'orders:read', endpoint: A1_2B_MUTATION_ENDPOINTS[0] }, // admin/orders.js PATCH needs orders:update
    { readOnlyPermission: 'inventory:read', endpoint: A1_2B_MUTATION_ENDPOINTS.find((e) => e.label === 'admin/inventory/adjust.js POST') },
    { readOnlyPermission: 'coupons:read', endpoint: A1_2B_MUTATION_ENDPOINTS.find((e) => e.label === 'admin/coupons/index.js POST') }
  ];
  for (const { readOnlyPermission, endpoint } of cases) {
    const restore = installAdminUsersFetch({ id: '4', email: 'reader@cosmoskin.com.tr', role: 'custom', role_code: 'custom', permissions: [readOnlyPermission], is_active: true, status: 'active' });
    try {
      const res = await endpoint.handler({ request: adminMutationRequest(endpoint.url, endpoint.method, 'reader@cosmoskin.com.tr', endpoint.body), env: adminReadEnv(), params: endpoint.params });
      assert.equal(res.status, 403, `${endpoint.label}: a caller holding only '${readOnlyPermission}' must not be able to perform the mutation (needs '${endpoint.permission}')`);
    } finally { restore(); }
  }
});

test('A1.2b: a mutation permission does not accidentally unlock the file\'s unrelated GET/read route', async () => {
  const cases = [
    { mutationOnlyPermission: 'orders:update', getHandler: adminOrdersGet, url: 'https://local.test/api/admin/orders', params: {} },
    { mutationOnlyPermission: 'suppliers:manage', getHandler: adminSuppliersGet, url: 'https://local.test/api/admin/suppliers', params: {} },
    { mutationOnlyPermission: 'coupons:manage', getHandler: adminCouponsGet, url: 'https://local.test/api/admin/coupons', params: {} }
  ];
  for (const { mutationOnlyPermission, getHandler, url, params } of cases) {
    const restore = installAdminUsersFetch({ id: '5', email: 'writer@cosmoskin.com.tr', role: 'custom', role_code: 'custom', permissions: [mutationOnlyPermission], is_active: true, status: 'active' });
    try {
      const res = await getHandler({ request: adminReadRequest(url, 'writer@cosmoskin.com.tr'), env: adminReadEnv(), params });
      assert.equal(res.status, 403, `a caller holding only '${mutationOnlyPermission}' must not be able to pass the file's separate GET/read permission gate`);
    } finally { restore(); }
  }
});

test('A1.2b: high-caution order status transition endpoints keep their business-logic markers alongside the new permission gate', async () => {
  const ordersSrc = await fs.readFile(path.join(root, 'functions/api/admin/orders.js'), 'utf8');
  const statusSrc = await fs.readFile(path.join(root, 'functions/api/admin/orders/[id]/status.js'), 'utf8');
  for (const marker of ['assertOperationalTransition', 'releaseInventoryReservations', 'convertInventoryReservations', 'awardOrderPoints', 'promoteOrderPoints', 'reverseOrderPoints']) {
    assert.match(ordersSrc, new RegExp(marker), `admin/orders.js: business-logic marker '${marker}' must remain present alongside the A1.2b permission gate`);
  }
  for (const marker of ['releaseInventoryReservations', 'convertInventoryReservations', 'awardOrderPoints', 'promoteOrderPoints', 'reverseOrderPoints']) {
    assert.match(statusSrc, new RegExp(marker), `admin/orders/[id]/status.js: business-logic marker '${marker}' must remain present alongside the A1.2b permission gate`);
  }
});

// ---------------------------------------------------------------------------
// A1.2c: admin finance / refund / bank-account endpoint permission coverage.
// refunds.js has no separate seeded read permission, so GET and POST both
// reuse 'refunds:update' (per the A1.2 plan). bank-accounts.js deliberately
// uses a single 'bank_accounts:manage' string across GET/POST/PATCH (per the
// plan's "fraud-sensitive even to read" rationale for IBAN/payment-routing
// data) rather than a read/write split.
// ---------------------------------------------------------------------------
const A1_2C_FINANCE_READ_ENDPOINTS = [
  { label: 'admin/refunds.js GET', permission: 'refunds:update', handler: adminRefundsGet, url: 'https://local.test/api/admin/refunds', params: {} },
  { label: 'admin/invoices.js GET', permission: 'invoices:read', handler: adminInvoicesGet, url: 'https://local.test/api/admin/invoices', params: {} },
  { label: 'admin/bank-accounts.js GET', permission: 'bank_accounts:manage', handler: adminBankAccountsGet, url: 'https://local.test/api/admin/bank-accounts', params: {} }
];
const A1_2C_FINANCE_MUTATION_ENDPOINTS = [
  { label: 'admin/refunds.js POST', permission: 'refunds:update', handler: adminRefundsPost, method: 'POST', url: 'https://local.test/api/admin/refunds', params: {}, body: { order_id: 'order-1', status: 'pending' } },
  { label: 'admin/invoices.js POST', permission: 'invoices:update', handler: adminInvoicesPost, method: 'POST', url: 'https://local.test/api/admin/invoices', params: {}, body: { order_id: 'order-1' } },
  { label: 'admin/invoices.js PATCH', permission: 'invoices:update', handler: adminInvoicesPatch, method: 'PATCH', url: 'https://local.test/api/admin/invoices', params: {}, body: { id: 'inv-1' } },
  { label: 'admin/bank-accounts.js POST', permission: 'bank_accounts:manage', handler: adminBankAccountsPost, method: 'POST', url: 'https://local.test/api/admin/bank-accounts', params: {}, body: { bank_name: 'Test Bank', account_holder: 'Test Holder', iban: 'TR330006100519786457841326' } },
  { label: 'admin/bank-accounts.js PATCH', permission: 'bank_accounts:manage', handler: adminBankAccountsPatch, method: 'PATCH', url: 'https://local.test/api/admin/bank-accounts', params: {}, body: { id: 'bank-1' } }
];

test('A1.2c: non-authorized admin cannot access finance read endpoints (403)', async () => {
  const restore = installAdminUsersFetch(null);
  try {
    for (const { label, handler, url, params } of A1_2C_FINANCE_READ_ENDPOINTS) {
      const res = await handler({ request: adminReadRequest(url, 'unknown@example.com'), env: adminReadEnv(), params });
      assert.equal(res.status, 403, `${label}: expected 403 for a caller with no matching admin_users row, got ${res.status}`);
    }
  } finally { restore(); }
});

test('A1.2c: non-authorized admin cannot call finance mutation endpoints (403)', async () => {
  const restore = installAdminUsersFetch(null);
  try {
    for (const { label, handler, method, url, params, body } of A1_2C_FINANCE_MUTATION_ENDPOINTS) {
      const res = await handler({ request: adminMutationRequest(url, method, 'unknown@example.com', body), env: adminReadEnv(), params });
      assert.equal(res.status, 403, `${label}: expected 403 for a caller with no matching admin_users row, got ${res.status}`);
    }
  } finally { restore(); }
});

test('A1.2c: owner (permissions [\'*\']) can access finance read endpoints', async () => {
  const restore = installAdminUsersFetch({ id: '1', email: 'cankolsun@gmail.com', role: 'owner', role_code: 'owner', permissions: ['*'], is_active: true, status: 'active' });
  try {
    for (const { label, handler, url, params } of A1_2C_FINANCE_READ_ENDPOINTS) {
      const res = await handler({ request: adminReadRequest(url, 'cankolsun@gmail.com'), env: adminReadEnv(), params });
      assert.notEqual(res.status, 403, `${label}: owner must not be blocked by the new permission gate, got ${res.status}`);
    }
  } finally { restore(); }
});

test('A1.2c: owner (permissions [\'*\']) can call finance mutation endpoints', async () => {
  const restore = installAdminUsersFetch({ id: '1', email: 'cankolsun@gmail.com', role: 'owner', role_code: 'owner', permissions: ['*'], is_active: true, status: 'active' });
  try {
    for (const { label, handler, method, url, params, body } of A1_2C_FINANCE_MUTATION_ENDPOINTS) {
      const res = await handler({ request: adminMutationRequest(url, method, 'cankolsun@gmail.com', body), env: adminReadEnv(), params });
      assert.notEqual(res.status, 403, `${label}: owner must not be blocked by the new permission gate, got ${res.status}`);
    }
  } finally { restore(); }
});

test('A1.2c: read-only finance permission cannot perform the finance mutation (read does not imply write)', async () => {
  const restore = installAdminUsersFetch({ id: '6', email: 'accountant@cosmoskin.com.tr', role: 'accountant', role_code: 'accountant', permissions: ['invoices:read'], is_active: true, status: 'active' });
  try {
    const res = await adminInvoicesPost({ request: adminMutationRequest('https://local.test/api/admin/invoices', 'POST', 'accountant@cosmoskin.com.tr', { order_id: 'order-1' }), env: adminReadEnv(), params: {} });
    assert.equal(res.status, 403, 'a caller holding only invoices:read must not be able to perform the invoices:update mutation');
  } finally { restore(); }
});

test('A1.2c: a finance mutation permission does not accidentally unlock the file\'s unrelated GET/read route', async () => {
  const restore = installAdminUsersFetch({ id: '7', email: 'writer@cosmoskin.com.tr', role: 'custom', role_code: 'custom', permissions: ['invoices:update'], is_active: true, status: 'active' });
  try {
    const res = await adminInvoicesGet({ request: adminReadRequest('https://local.test/api/admin/invoices', 'writer@cosmoskin.com.tr'), env: adminReadEnv(), params: {} });
    assert.equal(res.status, 403, 'a caller holding only invoices:update must not be able to pass the separate invoices:read gate');
  } finally { restore(); }
});

test('A1.2c: high-caution finance endpoints keep their business-logic markers alongside the new permission gate', async () => {
  const refundsSrc = await fs.readFile(path.join(root, 'functions/api/admin/refunds.js'), 'utf8');
  const invoicesSrc = await fs.readFile(path.join(root, 'functions/api/admin/invoices.js'), 'utf8');
  const bankAccountsSrc = await fs.readFile(path.join(root, 'functions/api/admin/bank-accounts.js'), 'utf8');
  for (const marker of ['STATUSES', 'provider_reference', 'reverseOrderPoints', 'return_requests', 'sendCommerceTransactionalEmail', 'findCompletedRefund', 'validateRefundAmount', 'resolveProductRefundableCap', 'resolveShippingRefundableCap', 'allocateOrderDiscount', 'resolveItemProratedRefundableCap', 'snapshotBacked', 'order_items.pricing_snapshot']) {
    assert.match(refundsSrc, new RegExp(marker), `admin/refunds.js: business-logic marker '${marker}' must remain present alongside the A1.2c permission gate`);
  }
  for (const marker of ['TYPES', 'STATUSES', 'provider_reference', 'invoice_number', 'pdf_url', 'order_status_events']) {
    assert.match(invoicesSrc, new RegExp(marker), `admin/invoices.js: business-logic marker '${marker}' must remain present alongside the A1.2c permission gate`);
  }
  for (const marker of ['normalizeBankAccount', 'validateBankAccount', 'toDbPayload', 'sort_order']) {
    assert.match(bankAccountsSrc, new RegExp(marker), `admin/bank-accounts.js: business-logic marker '${marker}' must remain present alongside the A1.2c permission gate`);
  }
});

test('callback source contains no direct inventory read/update fallback and uses atomic processor', async () => {
  const source=await fs.readFile(path.join(root,'functions/api/iyzico-callback.js'),'utf8');
  assert.match(source,/process_iyzico_payment_success/);
  assert.doesNotMatch(source,/stock_on_hand\s*:\s*|convertInventoryReservations\s*,\s*releaseInventoryReservations/);
  assert.match(source,/PAYMENT_AMOUNT_MISMATCH/); assert.match(source,/PAYMENT_CURRENCY_MISMATCH/);
});

test('payment migration protects paid orders from expiry and exposes service-role-only processors', async () => {
  const sql=await fs.readFile(path.join(root,'supabase/migrations/20260616_payment_bank_and_callback_hardening.sql'),'utf8');
  assert.match(sql,/process_iyzico_payment_success/); assert.match(sql,/pg_advisory_xact_lock/);
  assert.match(sql,/NOT IN \('paid','refunded','partially_refunded'\)/);
  assert.match(sql,/REVOKE ALL ON FUNCTION public\.process_iyzico_payment_success/);
  assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.process_iyzico_payment_success.*service_role/s);
});

test('Smart Routine uses live inventory and warns rather than silently skipping changed products', async () => {
  const source=await fs.readFile(path.join(root,'assets/js/smart-routine.js'),'utf8');
  assert.match(source,/COSMOSKIN_STOCK/); assert.match(source,/checkItems/); assert.match(source,/refreshLiveInventory/);
  assert.match(source,/stok|ulaşılamıyor|değişti/i);
  const wizard=await fs.readFile(path.join(root,'assets/smart-routine-wizard.js'),'utf8');
  assert.match(wizard,/step<6|step===6/); assert.match(wizard,/data-wizard-back/); assert.match(wizard,/restart/);
});


test('newsletter sender env is consistent and does not hard-fail on contradictory BREVO sender rules', async () => {
  const envExample = await fs.readFile(path.join(root, '.env.example'), 'utf8');
  const source = await fs.readFile(path.join(root, 'functions/api/newsletter/subscribe.js'), 'utf8');
  assert.match(envExample, /NEWSLETTER_FROM_EMAIL=newsletter@cosmoskin\.com\.tr/);
  assert.match(source, /NEWSLETTER_FROM_EMAIL \|\| env\.BREVO_SENDER_EMAIL/);
  assert.doesNotMatch(source, /BREVO_SENDER_EMAIL\s*!==\s*['"]newsletter@cosmoskin\.com\.tr/);
  assert.match(source, /Newsletter e-posta gönderimi yapılandırması eksik/);
});

test('card checkout requires valid identity number for individual iyzico buyer payload', async () => {
  const api = await fs.readFile(path.join(root, 'functions/api/create-checkout.js'), 'utf8');
  const flow = await fs.readFile(path.join(root, 'assets/checkout-flow.js'), 'utf8');
  assert.match(api, /IDENTITY_NUMBER_REQUIRED/);
  assert.match(api, /requireCardIdentityNumber\(paymentMethod, customer, invoiceDetails\)/);
  assert.match(api, /identityNumber:\s*customer\.identity_number/);
  assert.match(flow, /Kartlı ödeme ile bireysel fatura için T\.C\. kimlik numarası zorunludur/);
  assert.match(flow, /T\.C\. Kimlik No \(kartlı ödeme için zorunlu\)/);
});

test('iyzico callback suppresses normal success email when paid processing RPC fails', async () => {
  const source = await fs.readFile(path.join(root, 'functions/api/iyzico-callback.js'), 'utf8');
  assert.match(source, /paymentVerifiedButProcessingFailed/);
  assert.match(source, /order_processing_review_required/);
  assert.match(source, /Normal başarı e-postası gönderilmedi/);
  assert.match(source, /confirmationEmailEligible/);
  const failureBranch = source.slice(source.indexOf('if \(paymentVerifiedButProcessingFailed\)'.replace(/\\/g,'')));
  assert.doesNotMatch(failureBranch.split('} else if')[0], /sendPaymentSuccessEmailSafely/);
});

test('sitemap contains only canonical legal URLs, not redirected root legal pages', async () => {
  const sitemap = await fs.readFile(path.join(root, 'sitemap.xml'), 'utf8');
  ['teslimat-kargo.html', 'iade-degisim.html', 'mesafeli-satis.html', 'on-bilgilendirme.html'].forEach((legacy) => {
    assert.doesNotMatch(sitemap, new RegExp(`https://www\\.cosmoskin\\.com\\.tr/${legacy}`));
  });
  assert.match(sitemap, /https:\/\/www\.cosmoskin\.com\.tr\/legal\/teslimat-ve-kargo\.html/);
  assert.match(sitemap, /https:\/\/www\.cosmoskin\.com\.tr\/legal\/iade-ve-cayma-politikasi\.html/);
  assert.doesNotMatch(sitemap, /pages\.dev|local-dev-host|staging/);
});

test('mobile redesign cannot mount legacy checkout or legal support shells', async () => {
  const source = await fs.readFile(path.join(root, 'assets/mobile-redesign.js'), 'utf8');
  assert.doesNotMatch(source, /function checkout(?:Page|Delivery|Payment)\s*\(/);
  assert.doesNotMatch(source, /function supportPage\s*\(/);
  assert.doesNotMatch(source, /data-cm-delivery-form|data-cm-checkout-form|data-cm-legal-check|cosmoskin_checkout_mobile_draft/);
  assert.match(source, /\/checkout\\\.html\$\/\.test\(p\)\) return null/);
  assert.match(source, /\/legal\\\//);
});

test('contact form has Turnstile-ready spam protection without exposing secrets', async () => {
  const envExample = await fs.readFile(path.join(root, '.env.example'), 'utf8');
  const html = await fs.readFile(path.join(root, 'contact.html'), 'utf8');
  const client = await fs.readFile(path.join(root, 'assets/contact-form.js'), 'utf8');
  const api = await fs.readFile(path.join(root, 'functions/api/contact.js'), 'utf8');
  const headers = await fs.readFile(path.join(root, '_headers'), 'utf8');
  assert.match(envExample, /TURNSTILE_SITE_KEY=/);
  assert.match(envExample, /TURNSTILE_SECRET_KEY=/);
  assert.match(html, /data-turnstile-container/);
  assert.match(client, /cf-turnstile/);
  assert.match(api, /verifyTurnstile/);
  assert.match(headers, /https:\/\/challenges\.cloudflare\.com/);
  assert.doesNotMatch(client, /TURNSTILE_SECRET_KEY/);
});

// ---------------------------------------------------------------------------
// B1: Bank Transfer Approval Finalization. Small in-memory fake-Postgres
// harness (table-name + eq./in.() filter matching only — enough to exercise
// the real code paths end-to-end) so a full mark_payment_paid bank-transfer
// admin approval can be tested without a real database.
// ---------------------------------------------------------------------------
function createFakeSupabase(seed = {}) {
  const tables = new Map();
  for (const [name, rows] of Object.entries(seed)) tables.set(name, rows.map((r) => ({ ...r })));
  const rpcCalls = [];
  let autoId = 1;
  function table(name) {
    if (!tables.has(name)) tables.set(name, []);
    return tables.get(name);
  }
  function matchesFilters(row, params) {
    for (const [key, value] of params.entries()) {
      if (['select', 'order', 'limit', 'offset'].includes(key)) continue;
      const v = String(value);
      if (v.startsWith('eq.')) {
        if (String(row[key] ?? '') !== v.slice(3)) return false;
      } else if (v.startsWith('in.(') && v.endsWith(')')) {
        const list = v.slice(4, -1).split(',');
        if (!list.includes(String(row[key] ?? ''))) return false;
      }
    }
    return true;
  }
  function rpcResult(name) {
    if (name === 'convert_order_inventory') return { ok: true, converted: 1, deducted: 1, idempotent: false };
    if (name === 'release_order_inventory') return { ok: true, released: 0, idempotent: true };
    if (name === 'cosmoskin_award_loyalty_for_order') return { ok: true, awarded: true };
    if (name === 'cosmoskin_promote_loyalty_for_order') return { ok: true };
    if (name === 'cosmoskin_reverse_loyalty_for_order') return { ok: true };
    return { ok: true };
  }
  async function fetchHandler(url, options = {}) {
    const u = new URL(String(url));
    const method = (options.method || 'GET').toUpperCase();
    const rpcMatch = u.pathname.match(/\/rest\/v1\/rpc\/([^/]+)$/);
    if (rpcMatch) {
      const name = rpcMatch[1];
      const body = options.body ? JSON.parse(options.body) : {};
      rpcCalls.push({ name, body });
      return response(rpcResult(name));
    }
    const tableMatch = u.pathname.match(/\/rest\/v1\/([^/]+)$/);
    const name = tableMatch ? tableMatch[1] : null;
    if (!name) return response([]);
    if (method === 'GET') {
      return response(table(name).filter((row) => matchesFilters(row, u.searchParams)));
    }
    if (method === 'POST') {
      const body = options.body ? JSON.parse(options.body) : {};
      const rows = (Array.isArray(body) ? body : [body]).map((row) => ({ id: row.id || `${name}-${autoId++}`, created_at: row.created_at || new Date().toISOString(), ...row }));
      table(name).push(...rows);
      return response(rows);
    }
    if (method === 'PATCH') {
      const body = options.body ? JSON.parse(options.body) : {};
      for (const row of table(name)) {
        if (matchesFilters(row, u.searchParams)) Object.assign(row, body);
      }
      return response([]);
    }
    return response([]);
  }
  return { fetchHandler, tables, rpcCalls, table };
}

function seedBankTransferOrder(overrides = {}) {
  return {
    id: 'order-bt-1',
    order_number: 'CS-B1-1001',
    user_id: 'user-1',
    status: 'pending_bank_transfer',
    payment_status: 'awaiting_transfer',
    fulfillment_status: 'not_started',
    payment_method: 'bank_transfer',
    customer_email: 'buyer@example.com',
    customer_first_name: 'Ayşe',
    customer_last_name: 'Yılmaz',
    coupon_code: 'FREESHIP',
    discount_amount: 89,
    total_amount: 899,
    invoice_type: 'Bireysel',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides
  };
}
function b1AdminEnv() {
  return { ADMIN_TOKEN: 'a'.repeat(64), ADMIN_ALLOW_LEGACY_TOKEN: 'true', SUPABASE_URL: env.SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY };
}
function b1OwnerAdminUsersRow() {
  return { id: 'admin-1', email: 'cankolsun@gmail.com', role: 'owner', role_code: 'owner', permissions: ['*'], is_active: true, status: 'active' };
}
function b1PatchRequest(url, method, email, body) {
  const headers = { 'x-admin-token': 'a'.repeat(64), 'CF-Connecting-IP': '192.0.2.40', 'content-type': 'application/json' };
  if (email) headers['Cf-Access-Authenticated-User-Email'] = email;
  return new Request(url, { method, headers, body: JSON.stringify(body) });
}
async function installFakeSupabaseWithAdmin(seed) {
  const fake = createFakeSupabase(seed);
  const restore = installFetch(async (url, options = {}) => {
    const href = String(url instanceof Request ? url.url : url);
    if (href.includes('/rest/v1/admin_users')) return response([b1OwnerAdminUsersRow()]);
    if (href.includes('/rest/v1/admin_permissions')) return response([]);
    return await fake.fetchHandler(url, options);
  });
  return { fake, restore };
}

test('B1: confirmManualBankTransferPayment finalizes payments/payment_events/coupon/invoice/loyalty and is idempotent on a repeat call', async () => {
  const { fake, restore } = await installFakeSupabaseWithAdmin({
    orders: [seedBankTransferOrder()],
    payments: [{ id: 'pay-1', order_id: 'order-bt-1', provider: 'bank_transfer', status: 'awaiting_transfer', amount: 899, currency: 'TRY', created_at: new Date().toISOString() }],
    coupons: [{ id: 'coupon-1', code: 'FREESHIP' }]
  });
  try {
    const ctx = { env: b1AdminEnv() };
    const first = await confirmManualBankTransferPayment(ctx, 'order-bt-1', { approvedByEmail: 'owner@cosmoskin.com.tr' });
    assert.equal(first.ok, true);
    assert.equal(first.idempotent, false);

    assert.equal(fake.table('payments')[0].status, 'paid');
    assert.equal(fake.table('payment_events').length, 1);
    assert.equal(fake.table('payment_events')[0].event_type, 'bank_transfer_payment_confirmed');
    assert.equal(fake.table('payment_events')[0].provider, 'bank_transfer');
    assert.equal(fake.table('payment_events')[0].metadata.approved_by_email, 'owner@cosmoskin.com.tr');
    assert.equal(fake.table('coupon_redemptions').length, 1);
    assert.equal(fake.table('coupon_redemptions')[0].status, 'used');
    assert.equal(fake.table('invoice_records').length, 1);
    assert.equal(fake.table('shipments').length, 1);
    assert.ok(fake.rpcCalls.some((c) => c.name === 'convert_order_inventory'));
    assert.ok(fake.rpcCalls.some((c) => c.name === 'cosmoskin_award_loyalty_for_order' && c.body.p_order_id === 'order-bt-1'));

    // Repeat approval must be a safe no-op: no new payment_events/coupon/invoice/shipment rows.
    const second = await confirmManualBankTransferPayment(ctx, 'order-bt-1', { approvedByEmail: 'owner@cosmoskin.com.tr' });
    assert.equal(second.ok, true);
    assert.equal(second.idempotent, true);
    assert.equal(fake.table('payment_events').length, 1, 'repeat approval must not duplicate payment_events');
    assert.equal(fake.table('coupon_redemptions').length, 1, 'repeat approval must not duplicate coupon finalization');
    assert.equal(fake.table('invoice_records').length, 1, 'repeat approval must not duplicate the invoice shell');
    assert.equal(fake.table('shipments').length, 1, 'repeat approval must not duplicate the shipment shell');
  } finally { restore(); }
});

test('B1: confirmManualBankTransferPayment rejects a non-bank_transfer (card) order', async () => {
  const { restore } = await installFakeSupabaseWithAdmin({
    orders: [seedBankTransferOrder({ id: 'order-card-1', payment_method: 'iyzico' })]
  });
  try {
    await assert.rejects(
      confirmManualBankTransferPayment({ env: b1AdminEnv() }, 'order-card-1'),
      (error) => error.code === 'NOT_BANK_TRANSFER_ORDER' && error.status === 400
    );
  } finally { restore(); }
});

test('B1: admin/orders.js mark_payment_paid finalizes a bank-transfer order end-to-end, sends payment_confirmed_manual exactly once across two approval clicks, and records the real admin identity', async () => {
  const { fake, restore } = await installFakeSupabaseWithAdmin({
    orders: [seedBankTransferOrder()],
    payments: [{ id: 'pay-1', order_id: 'order-bt-1', provider: 'bank_transfer', status: 'awaiting_transfer', amount: 899, currency: 'TRY', created_at: new Date().toISOString() }],
    coupons: [{ id: 'coupon-1', code: 'FREESHIP' }]
  });
  try {
    const req1 = b1PatchRequest('https://local.test/api/admin/orders', 'PATCH', 'cankolsun@gmail.com', { id: 'order-bt-1', action: 'mark_payment_paid' });
    const res1 = await adminOrdersPatch({ request: req1, env: b1AdminEnv(), params: {} });
    const data1 = await res1.json();
    assert.equal(res1.status, 200);
    assert.equal(data1.ok, true);
    assert.equal(data1.bank_transfer_confirmation.idempotent, false);
    assert.equal(fake.table('orders')[0].payment_status, 'paid');
    assert.equal(fake.table('payment_events').length, 1);

    const paidEvent = fake.table('order_status_events').find((e) => e.event_type === 'mark_payment_paid');
    assert.ok(paidEvent, 'mark_payment_paid order_status_events row must be recorded');
    assert.equal(paidEvent.created_by, 'cankolsun@gmail.com', 'real admin identity must be captured instead of a hardcoded "admin" literal');

    const emailEventsAfterFirst = fake.table('email_events').filter((e) => e.email_type === 'payment_confirmed_manual');
    assert.equal(emailEventsAfterFirst.length, 1, 'payment_confirmed_manual must be logged exactly once after the first approval');

    // Second click on the same (now-paid) order must not duplicate anything.
    const req2 = b1PatchRequest('https://local.test/api/admin/orders', 'PATCH', 'cankolsun@gmail.com', { id: 'order-bt-1', action: 'mark_payment_paid' });
    const res2 = await adminOrdersPatch({ request: req2, env: b1AdminEnv(), params: {} });
    const data2 = await res2.json();
    assert.equal(res2.status, 200);
    assert.equal(data2.bank_transfer_confirmation.idempotent, true);
    assert.equal(fake.table('payment_events').length, 1, 'second approval must not duplicate payment_events');
    const emailEventsAfterSecond = fake.table('email_events').filter((e) => e.email_type === 'payment_confirmed_manual');
    assert.equal(emailEventsAfterSecond.length, 1, 'payment_confirmed_manual must not be sent a second time on the repeat approval click');
    assert.equal(fake.table('coupon_redemptions').length, 1);
    assert.equal(fake.table('invoice_records').length, 1);
  } finally { restore(); }
});

test('B1: admin/orders.js mark_payment_paid never calls confirmManualBankTransferPayment for a card-payment order', async () => {
  const { fake, restore } = await installFakeSupabaseWithAdmin({
    orders: [seedBankTransferOrder({ id: 'order-card-2', payment_method: 'iyzico', payment_status: 'initiated', status: 'pending_payment', coupon_code: null })],
    payments: [{ id: 'pay-2', order_id: 'order-card-2', provider: 'iyzico', status: 'initiated', amount: 899, currency: 'TRY', created_at: new Date().toISOString() }]
  });
  try {
    const req = b1PatchRequest('https://local.test/api/admin/orders', 'PATCH', 'cankolsun@gmail.com', { id: 'order-card-2', action: 'mark_payment_paid' });
    const res = await adminOrdersPatch({ request: req, env: b1AdminEnv(), params: {} });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.bank_transfer_confirmation, null, 'confirmManualBankTransferPayment must not run for a card-payment order');
    assert.equal(fake.table('payment_events').length, 0, 'no bank-transfer payment_events row must be written for a card order');
    // Existing (pre-B1) admin correction behavior must still work: email sent once.
    const emailEvents = fake.table('email_events').filter((e) => e.email_type === 'payment_confirmed_manual');
    assert.equal(emailEvents.length, 1);
  } finally { restore(); }
});

test('B1: admin/orders.js unauthorized admin cannot approve a bank-transfer order (403, no writes)', async () => {
  const fake = createFakeSupabase({ orders: [seedBankTransferOrder()] });
  const restore = installFetch(async (url, options = {}) => {
    const href = String(url instanceof Request ? url.url : url);
    if (href.includes('/rest/v1/admin_users')) return response([]);
    if (href.includes('/rest/v1/admin_permissions')) return response([]);
    return await fake.fetchHandler(url, options);
  });
  try {
    const req = b1PatchRequest('https://local.test/api/admin/orders', 'PATCH', 'attacker@example.com', { id: 'order-bt-1', action: 'mark_payment_paid' });
    const res = await adminOrdersPatch({ request: req, env: b1AdminEnv(), params: {} });
    assert.equal(res.status, 403);
    assert.equal(fake.table('orders')[0].payment_status, 'awaiting_transfer', 'no write may occur for a denied caller');
    assert.equal(fake.table('payment_events').length, 0);
  } finally { restore(); }
});

test('B1: admin/orders/[id]/status.js also finalizes a bank-transfer order marked paid via confirmManualBankTransferPayment', async () => {
  const { fake, restore } = await installFakeSupabaseWithAdmin({
    orders: [seedBankTransferOrder({ id: 'order-bt-2' })],
    payments: [{ id: 'pay-3', order_id: 'order-bt-2', provider: 'bank_transfer', status: 'awaiting_transfer', amount: 899, currency: 'TRY', created_at: new Date().toISOString() }],
    coupons: [{ id: 'coupon-1', code: 'FREESHIP' }]
  });
  try {
    const req = b1PatchRequest('https://local.test/api/admin/orders/order-bt-2/status', 'PATCH', 'cankolsun@gmail.com', { status: 'paid' });
    const res = await adminStatusPatch({ request: req, env: b1AdminEnv(), params: { id: 'order-bt-2' } });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.bank_transfer_confirmation.idempotent, false);
    assert.equal(fake.table('payment_events').length, 1);
    assert.equal(fake.table('payments').find((p) => p.order_id === 'order-bt-2').status, 'paid');
    assert.equal(fake.table('invoice_records').length, 1);

    const repeat = b1PatchRequest('https://local.test/api/admin/orders/order-bt-2/status', 'PATCH', 'cankolsun@gmail.com', { status: 'paid' });
    const resRepeat = await adminStatusPatch({ request: repeat, env: b1AdminEnv(), params: { id: 'order-bt-2' } });
    const dataRepeat = await resRepeat.json();
    assert.equal(dataRepeat.bank_transfer_confirmation.idempotent, true);
    assert.equal(fake.table('payment_events').length, 1, 'repeat status.js approval must not duplicate payment_events');
  } finally { restore(); }
});

// NOTE: at B1 time this test asserted that mark_bank_transfer_not_received
// left payment_events empty and the payments row untouched, because B1 was
// explicitly forbidden from touching rejection. B2
// (COSMOSKIN_B2_BANK_TRANSFER_REJECTION_FINALIZATION_PLAN_20260705.md)
// intentionally and legitimately closes that exact gap via
// rejectManualBankTransferPayment() — see the "B2:" tests below for full
// coverage. This test is updated in place to assert the new, correct
// behavior instead of the old (intentionally incomplete) B1 behavior; it
// still proves confirmManualBankTransferPayment is never called on rejection.
test('B1→B2: mark_bank_transfer_not_received now finalizes the payments row/payment_events for a bank-transfer order, still never calls confirmManualBankTransferPayment', async () => {
  const { fake, restore } = await installFakeSupabaseWithAdmin({
    orders: [seedBankTransferOrder()],
    payments: [{ id: 'pay-1', order_id: 'order-bt-1', provider: 'bank_transfer', status: 'awaiting_transfer', amount: 899, currency: 'TRY', created_at: new Date().toISOString() }]
  });
  try {
    const req = b1PatchRequest('https://local.test/api/admin/orders', 'PATCH', 'cankolsun@gmail.com', { id: 'order-bt-1', action: 'mark_bank_transfer_not_received' });
    const res = await adminOrdersPatch({ request: req, env: b1AdminEnv(), params: {} });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.bank_transfer_confirmation, null, 'rejection flow must never call confirmManualBankTransferPayment');
    assert.equal(data.bank_transfer_rejection.idempotent, false);
    assert.equal(fake.table('orders')[0].status, 'cancelled');
    assert.equal(fake.table('orders')[0].payment_status, 'failed');
    assert.equal(fake.table('payment_events').length, 1, 'B2: rejection must now write exactly one payment_events row');
    assert.equal(fake.table('payment_events')[0].event_type, 'bank_transfer_payment_rejected');
    assert.ok(fake.rpcCalls.some((c) => c.name === 'release_order_inventory'), 'rejection must still release inventory');
    assert.equal(fake.table('payments')[0].status, 'failed', 'B2: the payments row must now be finalized to failed on rejection');
  } finally { restore(); }
});

// ---------------------------------------------------------------------------
// B2: Bank Transfer Rejection / Cancellation Finalization.
// ---------------------------------------------------------------------------
test('B2: rejectManualBankTransferPayment finalizes payments/payment_events/inventory/coupon release and is idempotent on a repeat call', async () => {
  const { fake, restore } = await installFakeSupabaseWithAdmin({
    orders: [seedBankTransferOrder()],
    payments: [{ id: 'pay-1', order_id: 'order-bt-1', provider: 'bank_transfer', status: 'awaiting_transfer', amount: 899, currency: 'TRY', created_at: new Date().toISOString() }],
    coupons: [{ id: 'coupon-1', code: 'FREESHIP' }],
    coupon_redemptions: [{ id: 'redemption-1', order_id: 'order-bt-1', coupon_id: 'coupon-1', status: 'pending' }]
  });
  try {
    const ctx = { env: b1AdminEnv() };
    const first = await rejectManualBankTransferPayment(ctx, 'order-bt-1', { rejectedByEmail: 'owner@cosmoskin.com.tr', reason: 'Ödeme alınamadı.' });
    assert.equal(first.ok, true);
    assert.equal(first.idempotent, false);
    assert.equal(first.blocked, false);

    assert.equal(fake.table('payments')[0].status, 'failed');
    assert.equal(fake.table('payment_events').length, 1);
    assert.equal(fake.table('payment_events')[0].event_type, 'bank_transfer_payment_rejected');
    assert.equal(fake.table('payment_events')[0].provider, 'bank_transfer');
    assert.equal(fake.table('payment_events')[0].metadata.rejected_by_email, 'owner@cosmoskin.com.tr');
    assert.equal(fake.table('coupon_redemptions')[0].status, 'released');
    assert.ok(fake.rpcCalls.some((c) => c.name === 'release_order_inventory'), 'reserved inventory for the order must be released');
    assert.equal(fake.table('invoice_records').length, 0, 'a rejected order must never gain an invoice shell');
    assert.equal(fake.table('shipments').length, 0, 'a rejected order must never gain a shipment shell');
    assert.equal(fake.rpcCalls.some((c) => c.name === 'cosmoskin_award_loyalty_for_order'), false, 'a rejected order must never be awarded loyalty points');

    // Repeat rejection must be a safe no-op: no new payment_events row, no
    // second inventory-release/coupon-release write.
    const couponWritesBefore = fake.table('coupon_redemptions').length;
    const second = await rejectManualBankTransferPayment(ctx, 'order-bt-1', { rejectedByEmail: 'owner@cosmoskin.com.tr' });
    assert.equal(second.ok, true);
    assert.equal(second.idempotent, true);
    assert.equal(fake.table('payment_events').length, 1, 'repeat rejection must not duplicate payment_events');
    assert.equal(fake.table('coupon_redemptions').length, couponWritesBefore, 'repeat rejection must not duplicate coupon release rows');
  } finally { restore(); }
});

test('B2: rejectManualBankTransferPayment rejects a non-bank_transfer (card) order', async () => {
  const { restore } = await installFakeSupabaseWithAdmin({
    orders: [seedBankTransferOrder({ id: 'order-card-3', payment_method: 'iyzico' })]
  });
  try {
    await assert.rejects(
      rejectManualBankTransferPayment({ env: b1AdminEnv() }, 'order-card-3'),
      (error) => error.code === 'NOT_BANK_TRANSFER_ORDER' && error.status === 400
    );
  } finally { restore(); }
});

test('B2: rejectManualBankTransferPayment blocks and performs zero writes against an already-paid bank-transfer order', async () => {
  const { fake, restore } = await installFakeSupabaseWithAdmin({
    orders: [seedBankTransferOrder({ id: 'order-bt-paid', status: 'paid', payment_status: 'paid', fulfillment_status: 'preparing' })],
    payments: [{ id: 'pay-4', order_id: 'order-bt-paid', provider: 'bank_transfer', status: 'paid', amount: 899, currency: 'TRY', created_at: new Date().toISOString() }],
    coupon_redemptions: [{ id: 'redemption-2', order_id: 'order-bt-paid', coupon_id: 'coupon-1', status: 'used' }]
  });
  try {
    const result = await rejectManualBankTransferPayment({ env: b1AdminEnv() }, 'order-bt-paid', { rejectedByEmail: 'owner@cosmoskin.com.tr' });
    assert.equal(result.ok, false);
    assert.equal(result.blocked, true);
    assert.equal(result.reason, 'already_paid_or_settled');
    assert.equal(fake.table('payments')[0].status, 'paid', 'an already-paid order\'s payments row must never be marked failed');
    assert.equal(fake.table('orders')[0].payment_status, 'paid', 'an already-paid order must never be marked payment_status failed');
    assert.equal(fake.table('orders')[0].status, 'paid');
    assert.equal(fake.table('coupon_redemptions')[0].status, 'used', 'an already-used coupon must never be released by a blocked rejection');
    assert.equal(fake.table('payment_events').length, 0, 'a blocked rejection must write zero payment_events rows');
    assert.equal(fake.rpcCalls.some((c) => c.name === 'release_order_inventory'), false, 'a blocked rejection must never release already-converted inventory');
  } finally { restore(); }
});

test('B2: admin/orders.js mark_bank_transfer_not_received finalizes rejection end-to-end and sends bank_transfer_not_received_cancelled exactly once across two rejection clicks', async () => {
  const { fake, restore } = await installFakeSupabaseWithAdmin({
    orders: [seedBankTransferOrder({ id: 'order-bt-3' })],
    payments: [{ id: 'pay-5', order_id: 'order-bt-3', provider: 'bank_transfer', status: 'awaiting_transfer', amount: 899, currency: 'TRY', created_at: new Date().toISOString() }],
    coupons: [{ id: 'coupon-1', code: 'FREESHIP' }],
    coupon_redemptions: [{ id: 'redemption-3', order_id: 'order-bt-3', coupon_id: 'coupon-1', status: 'pending' }]
  });
  try {
    const req1 = b1PatchRequest('https://local.test/api/admin/orders', 'PATCH', 'cankolsun@gmail.com', { id: 'order-bt-3', action: 'mark_bank_transfer_not_received', message: 'Havale 3 gün içinde alınamadı.' });
    const res1 = await adminOrdersPatch({ request: req1, env: b1AdminEnv(), params: {} });
    const data1 = await res1.json();
    assert.equal(res1.status, 200);
    assert.equal(data1.ok, true);
    assert.equal(data1.bank_transfer_rejection.idempotent, false);
    assert.equal(data1.bank_transfer_confirmation, null);
    assert.equal(fake.table('orders')[0].payment_status, 'failed');
    assert.equal(fake.table('orders')[0].status, 'cancelled');
    assert.equal(fake.table('payment_events').length, 1);
    assert.equal(fake.table('coupon_redemptions')[0].status, 'released');

    const rejectionEvent = fake.table('order_status_events').find((e) => e.event_type === 'mark_bank_transfer_not_received');
    assert.ok(rejectionEvent, 'mark_bank_transfer_not_received order_status_events row must be recorded');
    assert.equal(rejectionEvent.created_by, 'cankolsun@gmail.com', 'real admin identity must be captured');

    const emailEventsAfterFirst = fake.table('email_events').filter((e) => e.order_id === 'order-bt-3');
    assert.equal(emailEventsAfterFirst.length, 1, 'exactly one rejection email must be logged after the first click');
    assert.equal(emailEventsAfterFirst[0].email_type, 'bank_transfer_not_received_cancelled', 'B2E: rejection audit row must use bank_transfer_not_received_cancelled, not order_created');

    // Second click on the same (now-rejected) order must not duplicate anything.
    const req2 = b1PatchRequest('https://local.test/api/admin/orders', 'PATCH', 'cankolsun@gmail.com', { id: 'order-bt-3', action: 'mark_bank_transfer_not_received' });
    const res2 = await adminOrdersPatch({ request: req2, env: b1AdminEnv(), params: {} });
    const data2 = await res2.json();
    assert.equal(res2.status, 200);
    assert.equal(data2.bank_transfer_rejection.idempotent, true);
    assert.equal(fake.table('payment_events').length, 1, 'second rejection click must not duplicate payment_events');
    const emailEventsAfterSecond = fake.table('email_events').filter((e) => e.order_id === 'order-bt-3');
    assert.equal(emailEventsAfterSecond.length, 1, 'the rejection email must not be sent a second time on the repeat click');
  } finally { restore(); }
});

test('B2: admin/orders.js mark_bank_transfer_not_received never calls rejectManualBankTransferPayment for a card-payment order (legacy inline release path preserved)', async () => {
  const { fake, restore } = await installFakeSupabaseWithAdmin({
    orders: [seedBankTransferOrder({ id: 'order-card-4', payment_method: 'iyzico', payment_status: 'initiated', status: 'pending_payment', coupon_code: null })],
    payments: [{ id: 'pay-6', order_id: 'order-card-4', provider: 'iyzico', status: 'initiated', amount: 899, currency: 'TRY', created_at: new Date().toISOString() }]
  });
  try {
    const req = b1PatchRequest('https://local.test/api/admin/orders', 'PATCH', 'cankolsun@gmail.com', { id: 'order-card-4', action: 'mark_bank_transfer_not_received' });
    const res = await adminOrdersPatch({ request: req, env: b1AdminEnv(), params: {} });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.bank_transfer_rejection, null, 'rejectManualBankTransferPayment must not run for a card-payment order');
    assert.equal(fake.table('payment_events').length, 0, 'no bank-transfer payment_events row must be written for a card order');
    // Existing (pre-B2) legacy behavior must still work: inventory still released.
    assert.ok(fake.rpcCalls.some((c) => c.name === 'release_order_inventory'));
  } finally { restore(); }
});

test('B2: admin/orders.js unauthorized admin cannot reject a bank-transfer order (403, no writes)', async () => {
  const fake = createFakeSupabase({ orders: [seedBankTransferOrder({ id: 'order-bt-4' })] });
  const restore = installFetch(async (url, options = {}) => {
    const href = String(url instanceof Request ? url.url : url);
    if (href.includes('/rest/v1/admin_users')) return response([]);
    if (href.includes('/rest/v1/admin_permissions')) return response([]);
    return await fake.fetchHandler(url, options);
  });
  try {
    const req = b1PatchRequest('https://local.test/api/admin/orders', 'PATCH', 'attacker@example.com', { id: 'order-bt-4', action: 'mark_bank_transfer_not_received' });
    const res = await adminOrdersPatch({ request: req, env: b1AdminEnv(), params: {} });
    assert.equal(res.status, 403);
    assert.equal(fake.table('orders')[0].payment_status, 'awaiting_transfer', 'no write may occur for a denied caller');
    assert.equal(fake.table('payment_events').length, 0);
  } finally { restore(); }
});

test('B2: admin/orders/[id]/status.js also finalizes a bank-transfer order cancelled via rejectManualBankTransferPayment, and captures the real admin identity', async () => {
  const { fake, restore } = await installFakeSupabaseWithAdmin({
    orders: [seedBankTransferOrder({ id: 'order-bt-5' })],
    payments: [{ id: 'pay-7', order_id: 'order-bt-5', provider: 'bank_transfer', status: 'awaiting_transfer', amount: 899, currency: 'TRY', created_at: new Date().toISOString() }],
    coupons: [{ id: 'coupon-1', code: 'FREESHIP' }]
  });
  try {
    const req = b1PatchRequest('https://local.test/api/admin/orders/order-bt-5/status', 'PATCH', 'cankolsun@gmail.com', { status: 'cancelled', message: 'Havale alınamadı.' });
    const res = await adminStatusPatch({ request: req, env: b1AdminEnv(), params: { id: 'order-bt-5' } });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.bank_transfer_rejection.idempotent, false);
    assert.equal(data.bank_transfer_confirmation, null);
    assert.equal(fake.table('payment_events').length, 1);
    assert.equal(fake.table('payments').find((p) => p.order_id === 'order-bt-5').status, 'failed');
    assert.equal(fake.table('invoice_records').length, 0);

    const statusEvent = fake.table('order_status_events').find((e) => e.order_id === 'order-bt-5');
    assert.ok(statusEvent, 'order_status_events row must be recorded');
    assert.equal(statusEvent.created_by, 'cankolsun@gmail.com', 'B2: real admin identity must now be captured (previously missing entirely)');

    const repeat = b1PatchRequest('https://local.test/api/admin/orders/order-bt-5/status', 'PATCH', 'cankolsun@gmail.com', { status: 'cancelled' });
    const resRepeat = await adminStatusPatch({ request: repeat, env: b1AdminEnv(), params: { id: 'order-bt-5' } });
    const dataRepeat = await resRepeat.json();
    assert.equal(dataRepeat.bank_transfer_rejection.idempotent, true);
    assert.equal(fake.table('payment_events').length, 1, 'repeat status.js rejection must not duplicate payment_events');
  } finally { restore(); }
});

test('B2E: safeEmailType returns bank-transfer audit types and never maps unknown types to order_created', () => {
  assert.ok(EMAIL_TYPES.has('bank_transfer_reminder'));
  assert.ok(EMAIL_TYPES.has('bank_transfer_not_received_cancelled'));
  assert.equal(safeEmailType('bank_transfer_reminder'), 'bank_transfer_reminder');
  assert.equal(safeEmailType('bank_transfer_not_received_cancelled'), 'bank_transfer_not_received_cancelled');
  assert.equal(safeEmailType('payment_confirmed_manual'), 'payment_confirmed_manual');
  assert.equal(safeEmailType('order_created'), 'order_created');
  assert.equal(safeEmailType('cosmoskin_unsupported_email_type_b2e_test'), null);
  assert.notEqual(safeEmailType('bank_transfer_reminder'), 'order_created');
  assert.notEqual(safeEmailType('bank_transfer_not_received_cancelled'), 'order_created');
});

test('B2E: recordEmailEvent skips unsupported email_type without inserting order_created audit rows', async () => {
  const fake = createFakeSupabase({});
  const restore = installFetch(fake.fetchHandler);
  try {
    const ctx = { env: b1AdminEnv() };
    const result = await recordEmailEvent(ctx, {
      order_id: 'order-b2e-unknown',
      customer_email: 'buyer@example.com',
      email_type: 'cosmoskin_unsupported_email_type_b2e_test',
      status: 'sent',
      subject: 'Test',
      metadata: { source: 'local_integration_test' }
    });
    assert.equal(result, null);
    assert.equal(fake.table('email_events').length, 0, 'unsupported email_type must not create a mislabeled audit row');
  } finally { restore(); }
});

test('B2E: resendOrderEmail logs bank_transfer_reminder with correct email_type', async () => {
  const { fake, restore } = await installFakeSupabaseWithAdmin({
    orders: [seedBankTransferOrder({ id: 'order-b2e-reminder' })]
  });
  try {
    await resendOrderEmail({ env: b1AdminEnv() }, 'order-b2e-reminder', 'bank_transfer_reminder');
    const events = fake.table('email_events');
    assert.equal(events.length, 1);
    assert.equal(events[0].email_type, 'bank_transfer_reminder');
    assert.equal(events[0].customer_email, 'buyer@example.com');
  } finally { restore(); }
});

test('B2E: resendOrderEmail still logs order_created with correct email_type', async () => {
  const { fake, restore } = await installFakeSupabaseWithAdmin({
    orders: [seedBankTransferOrder({ id: 'order-b2e-created' })]
  });
  try {
    await resendOrderEmail({ env: b1AdminEnv() }, 'order-b2e-created', 'order_created');
    const events = fake.table('email_events');
    assert.equal(events.length, 1);
    assert.equal(events[0].email_type, 'order_created');
  } finally { restore(); }
});

const D1_USER = { id: 'user-d1', email: 'buyer@example.com' };

function seedReturnOrder(overrides = {}) {
  return {
    id: 'order-d1-1',
    order_number: 'CS-D1-1001',
    user_id: D1_USER.id,
    status: 'delivered',
    payment_status: 'paid',
    fulfillment_status: 'delivered',
    payment_method: 'iyzico',
    customer_email: D1_USER.email,
    subtotal_amount: 839,
    shipping_amount: 60,
    discount_amount: 0,
    total_amount: 899,
    currency: 'TRY',
    delivered_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    created_at: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides
  };
}

function seedReturnOrderItem(overrides = {}) {
  return {
    id: 'oi-d1-1',
    order_id: 'order-d1-1',
    product_id: 'prod-a',
    product_slug: 'beauty-of-joseon-relief-sun-spf50',
    product_name: 'Relief Sun SPF50',
    unit_price: 899,
    quantity: 2,
    line_total: 1798,
    ...overrides
  };
}

function seedDiscountedMultiLineOrder(overrides = {}) {
  return seedReturnOrder({
    subtotal_amount: 1000,
    discount_amount: 100,
    shipping_amount: 0,
    total_amount: 900,
    coupon_code: 'WELCOME10',
    ...overrides
  });
}

function seedMultiLineOrderItems(orderId = 'order-d2b-multi') {
  return [
    { id: 'oi-d2b-a', order_id: orderId, product_id: 'a', product_slug: 'prod-a', product_name: 'Product A', unit_price: 600, quantity: 1, line_total: 600 },
    { id: 'oi-d2b-b', order_id: orderId, product_id: 'b', product_slug: 'prod-b', product_name: 'Product B', unit_price: 400, quantity: 1, line_total: 400 }
  ];
}

function seedMultiLineOrderItemsWithSnapshots(orderId = 'order-d3a-multi') {
  return [
    {
      id: 'oi-d3a-a', order_id: orderId, product_id: 'a', product_slug: 'prod-a', product_name: 'Product A',
      unit_price: 600, quantity: 1, line_total: 600,
      allocated_order_discount: 60, paid_line_total: 540, paid_unit_price: 540,
      pricing_snapshot_version: 'v1_proportional_last_line_remainder'
    },
    {
      id: 'oi-d3a-b', order_id: orderId, product_id: 'b', product_slug: 'prod-b', product_name: 'Product B',
      unit_price: 400, quantity: 1, line_total: 400,
      allocated_order_discount: 40, paid_line_total: 360, paid_unit_price: 360,
      pricing_snapshot_version: 'v1_proportional_last_line_remainder'
    }
  ];
}

function seedReturnBundle(orderId, returnId, items) {
  return {
    return_requests: [{
      id: returnId,
      order_id: orderId,
      reason: 'Vazgeçtim',
      status: 'approved',
      refund_status: 'not_started',
      requested_items: items
    }],
    return_request_items: items.map((item, index) => ({
      id: `rri-${returnId}-${index}`,
      return_request_id: returnId,
      order_item_id: item.order_item_id,
      product_slug: item.product_slug,
      product_id: item.product_id,
      quantity: item.quantity,
      unit_price_snapshot: item.unit_price_snapshot,
      refundable_amount: item.refundable_amount
    }))
  };
}

function d1ReturnPost(body, token = 'customer-token') {
  return customerReturnsPost({
    request: new Request('https://local.test/api/returns', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body)
    }),
    env
  });
}

function installReturnsCustomerFetch(fake) {
  return installFetch(async (url, options = {}) => {
    const href = String(url instanceof Request ? url.url : url);
    if (href.includes('/auth/v1/user')) return response(D1_USER);
    return await fake.fetchHandler(url, options);
  });
}

test('D1: customer cannot create return for shipped order without delivery timestamp', async () => {
  const fake = createFakeSupabase({
    orders: [seedReturnOrder({ id: 'order-d1-shipped', status: 'shipped', fulfillment_status: 'shipped', delivered_at: null })],
    order_items: [seedReturnOrderItem({ id: 'oi-shipped', order_id: 'order-d1-shipped' })],
    shipments: [{ id: 'ship-1', order_id: 'order-d1-shipped', status: 'shipped', delivered_at: null, created_at: new Date().toISOString() }]
  });
  const restore = installReturnsCustomerFetch(fake);
  try {
    const res = await d1ReturnPost({
      order_id: 'order-d1-shipped',
      items: [{ order_item_id: 'oi-shipped', product_slug: 'beauty-of-joseon-relief-sun-spf50', quantity: 1, reason: 'Vazgeçtim' }],
      unused_confirmed: true,
      hygiene_confirmed: true,
      seal_intact_confirmed: true,
      resaleable_confirmed: true,
      return_terms_confirmed: true
    });
    const data = await res.json();
    assert.equal(res.status, 400);
    assert.match(data.error, /teslim edildikten sonra/i);
    assert.equal(fake.table('return_requests').length, 0);
  } finally { restore(); }
});

test('D1: customer can create return for delivered order within return window', async () => {
  const fake = createFakeSupabase({
    orders: [seedReturnOrder()],
    order_items: [seedReturnOrderItem()]
  });
  const restore = installReturnsCustomerFetch(fake);
  try {
    const res = await d1ReturnPost({
      order_id: 'order-d1-1',
      items: [{ order_item_id: 'oi-d1-1', product_slug: 'beauty-of-joseon-relief-sun-spf50', quantity: 1, reason: 'Vazgeçtim' }],
      unused_confirmed: true,
      hygiene_confirmed: true,
      seal_intact_confirmed: true,
      resaleable_confirmed: true,
      return_terms_confirmed: true
    });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.ok, true);
    assert.equal(fake.table('return_requests').length, 1);
    assert.equal(fake.table('return_request_items')[0].quantity, 1);
    assert.equal(fake.table('return_requests')[0].status, 'requested');
  } finally { restore(); }
});

test('D1: customer cannot create return for delivered order outside return window', async () => {
  const fake = createFakeSupabase({
    orders: [seedReturnOrder({ delivered_at: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString() })],
    order_items: [seedReturnOrderItem()]
  });
  const restore = installReturnsCustomerFetch(fake);
  try {
    const res = await d1ReturnPost({
      order_id: 'order-d1-1',
      items: [{ order_item_id: 'oi-d1-1', product_slug: 'beauty-of-joseon-relief-sun-spf50', quantity: 1, reason: 'Vazgeçtim' }],
      unused_confirmed: true,
      hygiene_confirmed: true,
      seal_intact_confirmed: true,
      resaleable_confirmed: true,
      return_terms_confirmed: true
    });
    const data = await res.json();
    assert.equal(res.status, 400);
    assert.match(data.error, /İade süresi dolmuştur/i);
  } finally { restore(); }
});

test('D1: customer cannot return more than purchased quantity cumulatively', async () => {
  const fake = createFakeSupabase({
    orders: [seedReturnOrder()],
    order_items: [seedReturnOrderItem({ quantity: 2 })],
    return_requests: [{ id: 'ret-prev', order_id: 'order-d1-1', status: 'requested', customer_email: D1_USER.email }],
    return_request_items: [{ id: 'rri-1', return_request_id: 'ret-prev', order_item_id: 'oi-d1-1', product_slug: 'beauty-of-joseon-relief-sun-spf50', quantity: 2 }]
  });
  const restore = installReturnsCustomerFetch(fake);
  try {
    const res = await d1ReturnPost({
      order_id: 'order-d1-1',
      items: [{ order_item_id: 'oi-d1-1', product_slug: 'beauty-of-joseon-relief-sun-spf50', quantity: 1, reason: 'Vazgeçtim' }],
      unused_confirmed: true,
      hygiene_confirmed: true,
      seal_intact_confirmed: true,
      resaleable_confirmed: true,
      return_terms_confirmed: true
    });
    const data = await res.json();
    assert.equal(res.status, 409);
    assert.match(data.error, /daha önce iade talebi/i);
    assert.equal(fake.table('return_requests').length, 1);
  } finally { restore(); }
});

test('D1: rejected prior return does not count against cumulative quantity budget', () => {
  const claimed = buildClaimedQuantityMap(
    [{ return_request_id: 'ret-rej', order_item_id: 'oi-d1-1', product_slug: 'sku-a', quantity: 2 }],
    new Map([['ret-rej', { id: 'ret-rej', status: 'rejected' }]])
  );
  assert.equal(claimed.get('oi-d1-1') || 0, 0);
  const check = validateCumulativeReturnQuantities(
    [{ order_item_id: 'oi-d1-1', product_slug: 'sku-a', quantity: 2, purchased_quantity: 2 }],
    claimed
  );
  assert.equal(check.ok, true);
});

test('D1: resolveDeliveryTimestamp ignores created_at and uses shipment delivered_at fallback', () => {
  const order = { status: 'shipped', delivered_at: null, created_at: '2020-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z' };
  const ts = resolveDeliveryTimestamp(order, [{ status: 'delivered', delivered_at: '2026-06-10T12:00:00.000Z' }]);
  assert.equal(ts, '2026-06-10T12:00:00.000Z');
  assert.equal(withinReturnWindow(order.created_at), false);
});

test('D1: customer return rejects foreign-owned attachment path (H1)', async () => {
  const fake = createFakeSupabase({
    orders: [seedReturnOrder()],
    order_items: [seedReturnOrderItem()]
  });
  const restore = installReturnsCustomerFetch(fake);
  try {
    const res = await d1ReturnPost({
      order_id: 'order-d1-1',
      items: [{ order_item_id: 'oi-d1-1', product_slug: 'beauty-of-joseon-relief-sun-spf50', quantity: 1, reason: 'Ürün hasarlı geldi' }],
      attachments: [{ file_path: 'customer/other-user/photo.jpg', file_name: 'photo.jpg', mime_type: 'image/jpeg', file_size: 1000 }],
      unused_confirmed: true,
      hygiene_confirmed: true,
      seal_intact_confirmed: true,
      resaleable_confirmed: true,
      return_terms_confirmed: true
    });
    assert.equal(res.status, 403);
  } finally { restore(); }
});

test('D1: admin cannot complete refund without provider_reference', async () => {
  const { fake, restore } = await installFakeSupabaseWithAdmin({
    orders: [seedReturnOrder({ id: 'order-d1-refund' })]
  });
  try {
    const req = b1PatchRequest('https://local.test/api/admin/refunds', 'POST', 'cankolsun@gmail.com', {
      order_id: 'order-d1-refund',
      status: 'completed',
      amount: 839
    });
    req.headers.set('content-type', 'application/json');
    const res = await adminRefundsPost({ request: req, env: b1AdminEnv(), params: {} });
    const data = await res.json();
    assert.equal(res.status, 400);
    assert.match(data.error, /işlem referansı zorunludur/i);
    assert.equal(fake.table('refund_records').length, 0);
  } finally { restore(); }
});

test('D1: admin can complete refund with provider_reference and cannot complete twice', async () => {
  const { fake, restore } = await installFakeSupabaseWithAdmin({
    orders: [seedReturnOrder({ id: 'order-d1-refund-2' })],
    return_requests: [{ id: 'ret-ref-1', order_id: 'order-d1-refund-2', status: 'received', customer_email: D1_USER.email, refund_status: 'pending' }]
  });
  try {
    const body = {
      order_id: 'order-d1-refund-2',
      return_request_id: 'ret-ref-1',
      status: 'completed',
      amount: 839,
      provider_reference: 'IYZICO-REF-12345'
    };
    const req1 = new Request('https://local.test/api/admin/refunds', {
      method: 'POST',
      headers: { 'x-admin-token': 'a'.repeat(64), 'Cf-Access-Authenticated-User-Email': 'cankolsun@gmail.com', 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    const res1 = await adminRefundsPost({ request: req1, env: b1AdminEnv(), params: {} });
    const data1 = await res1.json();
    assert.equal(res1.status, 200);
    assert.equal(data1.ok, true);
    assert.equal(fake.table('refund_records').length, 1);
    assert.equal(fake.table('refund_records')[0].provider_reference, 'IYZICO-REF-12345');

    const req2 = new Request('https://local.test/api/admin/refunds', {
      method: 'POST',
      headers: { 'x-admin-token': 'a'.repeat(64), 'Cf-Access-Authenticated-User-Email': 'cankolsun@gmail.com', 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    const res2 = await adminRefundsPost({ request: req2, env: b1AdminEnv(), params: {} });
    const data2 = await res2.json();
    assert.equal(res2.status, 200);
    assert.equal(data2.idempotent, true);
    assert.equal(fake.table('refund_records').length, 1);
  } finally { restore(); }
});

test('D1: unauthorized admin cannot mutate returns or refunds', async () => {
  const fake = createFakeSupabase({
    return_requests: [{ id: 'ret-d1-auth', order_id: 'order-d1-1', status: 'requested', customer_email: D1_USER.email }]
  });
  const restore = installFetch(async (url, options = {}) => {
    const href = String(url instanceof Request ? url.url : url);
    if (href.includes('/rest/v1/admin_users')) return response([]);
    if (href.includes('/rest/v1/admin_permissions')) return response([]);
    return await fake.fetchHandler(url, options);
  });
  try {
    const retReq = b1PatchRequest('https://local.test/api/admin/returns', 'PATCH', 'attacker@example.com', { id: 'ret-d1-auth', status: 'approved' });
    const retRes = await adminReturnsPatch({ request: retReq, env: b1AdminEnv(), params: {} });
    assert.equal(retRes.status, 403);

    const refundReq = new Request('https://local.test/api/admin/refunds', {
      method: 'POST',
      headers: { 'x-admin-token': 'a'.repeat(64), 'Cf-Access-Authenticated-User-Email': 'attacker@example.com', 'content-type': 'application/json' },
      body: JSON.stringify({ order_id: 'order-d1-1', status: 'pending' })
    });
    const refundRes = await adminRefundsPost({ request: refundReq, env: b1AdminEnv(), params: {} });
    assert.equal(refundRes.status, 403);
  } finally { restore(); }
});

test('D1: admin return approve rejects invalid status transition', async () => {
  const { fake, restore } = await installFakeSupabaseWithAdmin({
    return_requests: [{ id: 'ret-tr-1', order_id: 'order-d1-1', status: 'refunded', customer_email: D1_USER.email, refund_status: 'completed' }],
    orders: [seedReturnOrder()]
  });
  try {
    const req = b1PatchRequest('https://local.test/api/admin/returns', 'PATCH', 'cankolsun@gmail.com', { id: 'ret-tr-1', status: 'approved' });
    const res = await adminReturnsPatch({ request: req, env: b1AdminEnv(), params: {} });
    const data = await res.json();
    assert.equal(res.status, 400);
    assert.match(data.error, /Onay yalnızca/i);
    assert.equal(fake.table('return_requests')[0].status, 'refunded');
  } finally { restore(); }
});

function d2RefundPost(body, email = 'cankolsun@gmail.com') {
  return adminRefundsPost({
    request: new Request('https://local.test/api/admin/refunds', {
      method: 'POST',
      headers: {
        'x-admin-token': 'a'.repeat(64),
        'Cf-Access-Authenticated-User-Email': email,
        'content-type': 'application/json'
      },
      body: JSON.stringify(body)
    }),
    env: b1AdminEnv(),
    params: {}
  });
}

test('D2A: customer-preference refund excludes shipping from cap', async () => {
  const { fake, restore } = await installFakeSupabaseWithAdmin({
    orders: [seedReturnOrder({ id: 'order-d2a-product' })],
    payments: [{ id: 'pay-d2a-1', order_id: 'order-d2a-product', status: 'paid', amount: 899, currency: 'TRY' }]
  });
  try {
    const blocked = await d2RefundPost({
      order_id: 'order-d2a-product',
      status: 'completed',
      amount: 899,
      refund_responsibility: 'customer_preference',
      provider_reference: 'REF-SHIP-BLOCK'
    });
    const blockedData = await blocked.json();
    assert.equal(blocked.status, 400);
    assert.match(blockedData.error, /kalan iade edilebilir tutarı aşamaz/i);

    const ok = await d2RefundPost({
      order_id: 'order-d2a-product',
      status: 'completed',
      amount: 839,
      refund_responsibility: 'customer_preference',
      provider_reference: 'REF-PRODUCT-ONLY'
    });
    const okData = await ok.json();
    assert.equal(ok.status, 200);
    assert.equal(okData.ok, true);
    assert.equal(fake.table('refund_records').length, 1);
  } finally { restore(); }
});

test('D2A: seller-fault refund can include shipping when approved', async () => {
  const { fake, restore } = await installFakeSupabaseWithAdmin({
    orders: [seedReturnOrder({ id: 'order-d2a-seller' })]
  });
  try {
    const res = await d2RefundPost({
      order_id: 'order-d2a-seller',
      status: 'completed',
      amount: 899,
      refund_responsibility: 'seller_fault',
      provider_reference: 'REF-SELLER-FAULT'
    });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.ok, true);
    assert.equal(data.balance.shipping_included, true);
    assert.equal(fake.table('refund_records')[0].amount, 899);
  } finally { restore(); }
});

test('D2A: carrier-damage refund can include shipping', async () => {
  const { fake, restore } = await installFakeSupabaseWithAdmin({
    orders: [seedReturnOrder({ id: 'order-d2a-carrier' })]
  });
  try {
    const res = await d2RefundPost({
      order_id: 'order-d2a-carrier',
      status: 'completed',
      amount: 899,
      refund_responsibility: 'carrier_damage',
      provider_reference: 'REF-CARRIER'
    });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.balance.shipping_included, true);
  } finally { restore(); }
});

test('D2A: standard refund cannot exceed product-only refundable cap', async () => {
  const { fake, restore } = await installFakeSupabaseWithAdmin({
    orders: [seedReturnOrder({ id: 'order-d2-over' })]
  });
  try {
    const res = await d2RefundPost({
      order_id: 'order-d2-over',
      status: 'pending',
      amount: 850,
      refund_responsibility: 'customer_preference'
    });
    const data = await res.json();
    assert.equal(res.status, 400);
    assert.match(data.error, /kalan iade edilebilir tutarı aşamaz/i);
    assert.equal(fake.table('refund_records').length, 0);
  } finally { restore(); }
});

test('D2A: refund cannot exceed product plus approved shipping cap', async () => {
  const { fake, restore } = await installFakeSupabaseWithAdmin({
    orders: [seedReturnOrder({ id: 'order-d2a-cap' })]
  });
  try {
    const res = await d2RefundPost({
      order_id: 'order-d2a-cap',
      status: 'completed',
      amount: 950,
      refund_responsibility: 'seller_fault',
      provider_reference: 'REF-OVER-CAP'
    });
    const data = await res.json();
    assert.equal(res.status, 400);
    assert.match(data.error, /kalan iade edilebilir tutarı aşamaz/i);
  } finally { restore(); }
});

test('D2A: cannot create cumulative completed refunds above remaining cap', async () => {
  const { fake, restore } = await installFakeSupabaseWithAdmin({
    orders: [seedReturnOrder({ id: 'order-d2-cum' })],
    refund_records: [{ id: 'ref-cum-1', order_id: 'order-d2-cum', status: 'completed', amount: 500, provider_reference: 'REF-500', created_at: new Date().toISOString() }]
  });
  try {
    const res = await d2RefundPost({
      order_id: 'order-d2-cum',
      status: 'completed',
      amount: 400,
      refund_responsibility: 'customer_preference',
      provider_reference: 'REF-500B'
    });
    const data = await res.json();
    assert.equal(res.status, 400);
    assert.match(data.error, /kalan iade edilebilir tutarı aşamaz/i);
    assert.equal(fake.table('refund_records').length, 1);
  } finally { restore(); }
});

test('D2A: pending refund reserves remaining balance', async () => {
  const { fake, restore } = await installFakeSupabaseWithAdmin({
    orders: [seedReturnOrder({ id: 'order-d2-reserve' })],
    refund_records: [{ id: 'ref-pend-1', order_id: 'order-d2-reserve', status: 'pending', amount: 400, created_at: new Date().toISOString() }]
  });
  try {
    const res = await d2RefundPost({
      order_id: 'order-d2-reserve',
      status: 'completed',
      amount: 500,
      refund_responsibility: 'customer_preference',
      provider_reference: 'REF-RESERVE'
    });
    const data = await res.json();
    assert.equal(res.status, 400);
    assert.match(data.error, /kalan iade edilebilir tutarı aşamaz/i);
    assert.equal(fake.table('refund_records').length, 1);
  } finally { restore(); }
});

test('D2A: failed/cancelled refund does not reduce remaining balance', async () => {
  const { fake, restore } = await installFakeSupabaseWithAdmin({
    orders: [seedReturnOrder({ id: 'order-d2-failed' })],
    refund_records: [
      { id: 'ref-fail-1', order_id: 'order-d2-failed', status: 'failed', amount: 899, created_at: new Date().toISOString() },
      { id: 'ref-cancel-1', order_id: 'order-d2-failed', status: 'cancelled', amount: 899, created_at: new Date().toISOString() }
    ]
  });
  try {
    const res = await d2RefundPost({
      order_id: 'order-d2-failed',
      status: 'completed',
      amount: 839,
      refund_responsibility: 'customer_preference',
      provider_reference: 'REF-PRODUCT'
    });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.ok, true);
    assert.equal(fake.table('refund_records').length, 3);
  } finally { restore(); }
});

test('D2A: can complete partial refund within remaining product balance', async () => {
  const { fake, restore } = await installFakeSupabaseWithAdmin({
    orders: [seedReturnOrder({ id: 'order-d2-partial' })],
    refund_records: [
      { id: 'ref-done-1', order_id: 'order-d2-partial', status: 'completed', amount: 400, provider_reference: 'REF-400', created_at: new Date().toISOString() },
      { id: 'ref-pend-2', order_id: 'order-d2-partial', status: 'pending', amount: 200, created_at: new Date().toISOString() }
    ]
  });
  try {
    const res = await d2RefundPost({
      order_id: 'order-d2-partial',
      status: 'completed',
      amount: 239,
      refund_responsibility: 'customer_preference',
      provider_reference: 'REF-239'
    });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.ok, true);
    assert.equal(fake.table('refund_records').length, 3);
    assert.equal(fake.table('refund_records')[2].amount, 239);
  } finally { restore(); }
});

test('D2A: manual shipping refund requires reason when enabled', async () => {
  const { fake, restore } = await installFakeSupabaseWithAdmin({
    orders: [seedReturnOrder({ id: 'order-d2a-manual' })]
  });
  try {
    const res = await d2RefundPost({
      order_id: 'order-d2a-manual',
      status: 'pending',
      amount: 899,
      refund_responsibility: 'manual_review',
      include_shipping_refund: true
    });
    const data = await res.json();
    assert.equal(res.status, 400);
    assert.match(data.error, /Kargo bedeli iadesi için onay ve gerekçe zorunludur/i);
  } finally { restore(); }
});

test('D2A: manual shipping refund with reason can include shipping', async () => {
  const { fake, restore } = await installFakeSupabaseWithAdmin({
    orders: [seedReturnOrder({ id: 'order-d2a-manual-ok' })]
  });
  try {
    const res = await d2RefundPost({
      order_id: 'order-d2a-manual-ok',
      status: 'completed',
      amount: 899,
      refund_responsibility: 'manual_review',
      include_shipping_refund: true,
      shipping_refund_reason: 'Operasyon onayı ile kargo iadesi',
      provider_reference: 'REF-MANUAL-SHIP'
    });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.balance.shipping_included, true);
  } finally { restore(); }
});

test('D2A: cannot create refund with zero amount', async () => {
  const { fake, restore } = await installFakeSupabaseWithAdmin({
    orders: [seedReturnOrder({ id: 'order-d2-zero' })]
  });
  try {
    const res = await d2RefundPost({ order_id: 'order-d2-zero', status: 'pending', amount: 0 });
    const data = await res.json();
    assert.equal(res.status, 400);
    assert.match(data.error, /geçerli bir tutar olmalıdır/i);
    assert.equal(fake.table('refund_records').length, 0);
  } finally { restore(); }
});

test('D2A: cannot create refund with negative amount', async () => {
  const { fake, restore } = await installFakeSupabaseWithAdmin({
    orders: [seedReturnOrder({ id: 'order-d2-neg' })]
  });
  try {
    const res = await d2RefundPost({ order_id: 'order-d2-neg', status: 'pending', amount: -50 });
    const data = await res.json();
    assert.equal(res.status, 400);
    assert.match(data.error, /geçerli bir tutar olmalıdır/i);
    assert.equal(fake.table('refund_records').length, 0);
  } finally { restore(); }
});

test('D2A: cannot create refund for unpaid order', async () => {
  const { fake, restore } = await installFakeSupabaseWithAdmin({
    orders: [seedReturnOrder({ id: 'order-d2-unpaid', payment_status: 'pending_payment', status: 'pending_payment' })]
  });
  try {
    const res = await d2RefundPost({ order_id: 'order-d2-unpaid', status: 'pending', amount: 100 });
    const data = await res.json();
    assert.equal(res.status, 400);
    assert.match(data.error, /ödeme henüz alınmamış/i);
    assert.equal(fake.table('refund_records').length, 0);
  } finally { restore(); }
});

test('D2B: coupon discount prorates across returned items', async () => {
  const orderId = 'order-d2b-prorate';
  const returnId = 'ret-d2b-prorate';
  const items = [{ order_item_id: 'oi-d2b-a', product_slug: 'prod-a', quantity: 1, unit_price_snapshot: 600, refundable_amount: 600 }];
  const { fake, restore } = await installFakeSupabaseWithAdmin({
    orders: [seedDiscountedMultiLineOrder({ id: orderId })],
    order_items: seedMultiLineOrderItems(orderId),
    payments: [{ id: 'pay-d2b-1', order_id: orderId, status: 'paid', amount: 900, currency: 'TRY' }],
    ...seedReturnBundle(orderId, returnId, items)
  });
  try {
    const blocked = await d2RefundPost({
      order_id: orderId,
      return_request_id: returnId,
      status: 'completed',
      amount: 600,
      refund_responsibility: 'customer_preference',
      provider_reference: 'REF-PRE-DISC'
    });
    assert.equal(blocked.status, 400);
    assert.match((await blocked.json()).error, /fiilen ödediği tutarı aşamaz/i);

    const ok = await d2RefundPost({
      order_id: orderId,
      return_request_id: returnId,
      status: 'completed',
      amount: 540,
      refund_responsibility: 'customer_preference',
      provider_reference: 'REF-PRORATED'
    });
    const data = await ok.json();
    assert.equal(ok.status, 200);
    assert.equal(data.balance.item_prorated_product_cap, 540);
    assert.equal(fake.table('refund_records')[0].amount, 540);
  } finally { restore(); }
});

test('D2B: full-order return refunds paid product subtotal with shipping separate', async () => {
  const orderId = 'order-d2b-full';
  const returnId = 'ret-d2b-full';
  const items = [
    { order_item_id: 'oi-d2b-a', product_slug: 'prod-a', quantity: 1, unit_price_snapshot: 600, refundable_amount: 600 },
    { order_item_id: 'oi-d2b-b', product_slug: 'prod-b', quantity: 1, unit_price_snapshot: 400, refundable_amount: 400 }
  ];
  const { fake, restore } = await installFakeSupabaseWithAdmin({
    orders: [seedDiscountedMultiLineOrder({ id: orderId, shipping_amount: 89, total_amount: 989 })],
    order_items: seedMultiLineOrderItems(orderId),
    ...seedReturnBundle(orderId, returnId, items)
  });
  try {
    const productOnly = await d2RefundPost({
      order_id: orderId,
      return_request_id: returnId,
      status: 'completed',
      amount: 900,
      refund_responsibility: 'customer_preference',
      provider_reference: 'REF-FULL-PRODUCT'
    });
    assert.equal(productOnly.status, 200);
    assert.equal(fake.table('refund_records')[0].amount, 900);

    const shippingBlocked = await d2RefundPost({
      order_id: orderId,
      return_request_id: returnId,
      status: 'pending',
      amount: 89,
      refund_responsibility: 'customer_preference'
    });
    assert.equal(shippingBlocked.status, 400);
  } finally { restore(); }
});

test('D2B: multiple partial refunds cannot exceed prorated product amount', async () => {
  const orderId = 'order-d2b-multi-partial';
  const returnIdA = 'ret-d2b-a';
  const returnIdB = 'ret-d2b-b';
  const { fake, restore } = await installFakeSupabaseWithAdmin({
    orders: [seedDiscountedMultiLineOrder({ id: orderId })],
    order_items: seedMultiLineOrderItems(orderId),
    refund_records: [{ id: 'ref-done-a', order_id: orderId, status: 'completed', amount: 540, provider_reference: 'REF-A', created_at: new Date().toISOString() }],
    ...seedReturnBundle(orderId, returnIdB, [{ order_item_id: 'oi-d2b-b', product_slug: 'prod-b', quantity: 1, unit_price_snapshot: 400, refundable_amount: 400 }])
  });
  try {
    const res = await d2RefundPost({
      order_id: orderId,
      return_request_id: returnIdB,
      status: 'completed',
      amount: 360,
      refund_responsibility: 'customer_preference',
      provider_reference: 'REF-B'
    });
    assert.equal(res.status, 200);
    assert.equal(fake.table('refund_records').length, 2);

    const over = await d2RefundPost({
      order_id: orderId,
      return_request_id: returnIdB,
      status: 'pending',
      amount: 1,
      refund_responsibility: 'customer_preference'
    });
    assert.equal(over.status, 400);
  } finally { restore(); }
});

test('D2B: rounding remainder stays within paid product subtotal', async () => {
  const orderId = 'order-d2b-round';
  const returnId = 'ret-d2b-round';
  const orderItems = [
    { id: 'oi-r1', order_id: orderId, product_slug: 'p1', unit_price: 100, quantity: 1, line_total: 100 },
    { id: 'oi-r2', order_id: orderId, product_slug: 'p2', unit_price: 100, quantity: 1, line_total: 100 },
    { id: 'oi-r3', order_id: orderId, product_slug: 'p3', unit_price: 100, quantity: 1, line_total: 100 }
  ];
  const { fake, restore } = await installFakeSupabaseWithAdmin({
    orders: [seedReturnOrder({ id: orderId, subtotal_amount: 300, discount_amount: 10, shipping_amount: 0, total_amount: 290 })],
    order_items: orderItems,
    ...seedReturnBundle(orderId, returnId, [
      { order_item_id: 'oi-r1', product_slug: 'p1', quantity: 1, unit_price_snapshot: 100, refundable_amount: 100 },
      { order_item_id: 'oi-r2', product_slug: 'p2', quantity: 1, unit_price_snapshot: 100, refundable_amount: 100 },
      { order_item_id: 'oi-r3', product_slug: 'p3', quantity: 1, unit_price_snapshot: 100, refundable_amount: 100 }
    ])
  });
  try {
    const res = await d2RefundPost({
      order_id: orderId,
      return_request_id: returnId,
      status: 'completed',
      amount: 290,
      refund_responsibility: 'customer_preference',
      provider_reference: 'REF-ROUND'
    });
    assert.equal(res.status, 200);
    assert.equal(fake.table('refund_records')[0].amount, 290);
  } finally { restore(); }
});

test('D2B: seller_fault shipping inclusion still works with item proration', async () => {
  const orderId = 'order-d2b-ship';
  const returnId = 'ret-d2b-ship';
  const { fake, restore } = await installFakeSupabaseWithAdmin({
    orders: [seedDiscountedMultiLineOrder({ id: orderId, shipping_amount: 89, total_amount: 989 })],
    order_items: seedMultiLineOrderItems(orderId),
    ...seedReturnBundle(orderId, returnId, [{ order_item_id: 'oi-d2b-a', product_slug: 'prod-a', quantity: 1, unit_price_snapshot: 600, refundable_amount: 600 }])
  });
  try {
    const res = await d2RefundPost({
      order_id: orderId,
      return_request_id: returnId,
      status: 'completed',
      amount: 629,
      refund_responsibility: 'seller_fault',
      provider_reference: 'REF-SHIP-SELLER'
    });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.balance.shipping_included, true);
    assert.equal(fake.table('refund_records')[0].amount, 629);
  } finally { restore(); }
});

test('D2B: free shipping is not clawed back on partial return', async () => {
  const orderId = 'order-d2b-free-ship';
  const returnId = 'ret-d2b-free-ship';
  const { restore } = await installFakeSupabaseWithAdmin({
    orders: [seedDiscountedMultiLineOrder({ id: orderId, shipping_amount: 0, total_amount: 900 })],
    order_items: seedMultiLineOrderItems(orderId),
    ...seedReturnBundle(orderId, returnId, [{ order_item_id: 'oi-d2b-a', product_slug: 'prod-a', quantity: 1, unit_price_snapshot: 600, refundable_amount: 600 }])
  });
  try {
    const res = await d2RefundPost({
      order_id: orderId,
      return_request_id: returnId,
      status: 'completed',
      amount: 540,
      refund_responsibility: 'customer_preference',
      provider_reference: 'REF-NO-CLAW'
    });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.balance.shipping_included, false);
    assert.equal(data.balance.shipping_refundable_cap, 0);
  } finally { restore(); }
});

test('D2B: inconsistent order data falls back to D2A cap safely', async () => {
  const orderId = 'order-d2b-fallback';
  const returnId = 'ret-d2b-fallback';
  const { fake, restore } = await installFakeSupabaseWithAdmin({
    orders: [seedDiscountedMultiLineOrder({ id: orderId, subtotal_amount: 1200 })],
    order_items: seedMultiLineOrderItems(orderId),
    ...seedReturnBundle(orderId, returnId, [{ order_item_id: 'oi-d2b-a', product_slug: 'prod-a', quantity: 1, unit_price_snapshot: 600, refundable_amount: 600 }])
  });
  try {
    const res = await d2RefundPost({
      order_id: orderId,
      return_request_id: returnId,
      status: 'completed',
      amount: 540,
      refund_responsibility: 'customer_preference',
      provider_reference: 'REF-FALLBACK'
    });
    assert.equal(res.status, 200);
    assert.equal(fake.table('refund_records')[0].amount, 540);
  } finally { restore(); }
});

test('D2B: unsafe return item match blocks refund calculation', async () => {
  const orderId = 'order-d2b-unsafe';
  const returnId = 'ret-d2b-unsafe';
  const { fake, restore } = await installFakeSupabaseWithAdmin({
    orders: [seedDiscountedMultiLineOrder({ id: orderId })],
    order_items: seedMultiLineOrderItems(orderId),
    ...seedReturnBundle(orderId, returnId, [{ order_item_id: 'missing-item', product_slug: 'missing-slug', quantity: 1, unit_price_snapshot: 600, refundable_amount: 600 }])
  });
  try {
    const res = await d2RefundPost({
      order_id: orderId,
      return_request_id: returnId,
      status: 'pending',
      amount: 100,
      refund_responsibility: 'customer_preference'
    });
    const data = await res.json();
    assert.equal(res.status, 400);
    assert.match(data.error, /güvenli şekilde hesaplanamadı/i);
    assert.equal(fake.table('refund_records').length, 0);
  } finally { restore(); }
});

test('D3A: buildOrderItemPricingSnapshots stores allocated discount and paid totals', async () => {
  const { buildOrderItemPricingSnapshots } = await import('../functions/api/_lib/order-pricing-snapshot.js');
  const cart = [
    { product_id: 'a', line_total: 600, quantity: 1 },
    { product_id: 'b', line_total: 400, quantity: 1 }
  ];
  const rows = buildOrderItemPricingSnapshots(cart, 100);
  assert.equal(rows[0].allocated_order_discount, 60);
  assert.equal(rows[1].allocated_order_discount, 40);
  assert.equal(rows[0].paid_line_total, 540);
  assert.equal(rows[1].paid_line_total, 360);
  assert.equal(rows[0].pricing_snapshot_version, 'v1_proportional_last_line_remainder');
});

test('D3A: refund calculation prefers stored snapshot fields', async () => {
  const orderId = 'order-d3a-snapshot';
  const returnId = 'ret-d3a-snapshot';
  const items = [{ order_item_id: 'oi-d3a-a', product_slug: 'prod-a', quantity: 1, unit_price_snapshot: 600, refundable_amount: 600 }];
  const { fake, restore } = await installFakeSupabaseWithAdmin({
    orders: [seedDiscountedMultiLineOrder({ id: orderId })],
    order_items: seedMultiLineOrderItemsWithSnapshots(orderId),
    payments: [{ id: 'pay-d3a-1', order_id: orderId, status: 'paid', amount: 900, currency: 'TRY' }],
    ...seedReturnBundle(orderId, returnId, items)
  });
  try {
    const blocked = await d2RefundPost({
      order_id: orderId,
      return_request_id: returnId,
      status: 'completed',
      amount: 600,
      refund_responsibility: 'customer_preference',
      provider_reference: 'REF-D3A-PRE'
    });
    assert.equal(blocked.status, 400);

    const ok = await d2RefundPost({
      order_id: orderId,
      return_request_id: returnId,
      status: 'completed',
      amount: 540,
      refund_responsibility: 'customer_preference',
      provider_reference: 'REF-D3A-SNAP'
    });
    const data = await ok.json();
    assert.equal(ok.status, 200);
    assert.equal(data.balance.item_prorated_product_cap, 540);
    assert.equal(data.balance.snapshot_backed, true);
    assert.equal(data.balance.discount_source, 'order_items.pricing_snapshot');
    assert.equal(fake.table('refund_records')[0].metadata.snapshot_backed, true);
  } finally { restore(); }
});

test('D3A: legacy order without snapshot falls back to D2B reconstruction', async () => {
  const orderId = 'order-d3a-legacy';
  const returnId = 'ret-d3a-legacy';
  const { fake, restore } = await installFakeSupabaseWithAdmin({
    orders: [seedDiscountedMultiLineOrder({ id: orderId })],
    order_items: seedMultiLineOrderItems(orderId),
    payments: [{ id: 'pay-d3a-legacy', order_id: orderId, status: 'paid', amount: 900, currency: 'TRY' }],
    ...seedReturnBundle(orderId, returnId, [{ order_item_id: 'oi-d2b-a', product_slug: 'prod-a', quantity: 1, unit_price_snapshot: 600, refundable_amount: 600 }])
  });
  try {
    const res = await d2RefundPost({
      order_id: orderId,
      return_request_id: returnId,
      status: 'completed',
      amount: 540,
      refund_responsibility: 'customer_preference',
      provider_reference: 'REF-D3A-LEGACY'
    });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.notEqual(data.balance.snapshot_backed, true);
    assert.equal(data.balance.item_prorated_product_cap, 540);
  } finally { restore(); }
});

test('D3A: invalid snapshot data falls back to D2B reconstruction', async () => {
  const orderId = 'order-d3a-invalid';
  const returnId = 'ret-d3a-invalid';
  const badSnapshots = seedMultiLineOrderItemsWithSnapshots(orderId).map((row, index) => (
    index === 0
      ? { ...row, paid_line_total: 700, paid_unit_price: 700 }
      : row
  ));
  const { fake, restore } = await installFakeSupabaseWithAdmin({
    orders: [seedDiscountedMultiLineOrder({ id: orderId })],
    order_items: badSnapshots,
    payments: [{ id: 'pay-d3a-invalid', order_id: orderId, status: 'paid', amount: 900, currency: 'TRY' }],
    ...seedReturnBundle(orderId, returnId, [{ order_item_id: 'oi-d3a-a', product_slug: 'prod-a', quantity: 1, unit_price_snapshot: 600, refundable_amount: 600 }])
  });
  try {
    const res = await d2RefundPost({
      order_id: orderId,
      return_request_id: returnId,
      status: 'completed',
      amount: 540,
      refund_responsibility: 'customer_preference',
      provider_reference: 'REF-D3A-INVALID'
    });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.notEqual(data.balance.snapshot_backed, true);
    assert.equal(data.balance.item_prorated_product_cap, 540);
  } finally { restore(); }
});

test('D3A: seller_fault shipping inclusion still works with snapshot-backed items', async () => {
  const orderId = 'order-d3a-ship';
  const returnId = 'ret-d3a-ship';
  const { fake, restore } = await installFakeSupabaseWithAdmin({
    orders: [seedDiscountedMultiLineOrder({ id: orderId, shipping_amount: 89, total_amount: 989 })],
    order_items: seedMultiLineOrderItemsWithSnapshots(orderId),
    payments: [{ id: 'pay-d3a-ship', order_id: orderId, status: 'paid', amount: 989, currency: 'TRY' }],
    ...seedReturnBundle(orderId, returnId, [{ order_item_id: 'oi-d3a-a', product_slug: 'prod-a', quantity: 1, unit_price_snapshot: 600, refundable_amount: 600 }])
  });
  try {
    const res = await d2RefundPost({
      order_id: orderId,
      return_request_id: returnId,
      status: 'completed',
      amount: 629,
      refund_responsibility: 'seller_fault',
      provider_reference: 'REF-D3A-SHIP'
    });
    assert.equal(res.status, 200);
    assert.equal(fake.table('refund_records')[0].amount, 629);
  } finally { restore(); }
});

test('B2: generic cancel_order action and the paid-order direct-cancel 409 guard remain unchanged', async () => {
  // cancel_order is a generic action shared by card and bank-transfer orders
  // alike; B2 is deliberately scoped to mark_bank_transfer_not_received only
  // (see COSMOSKIN_B2_BANK_TRANSFER_REJECTION_FINALIZATION_PLAN_20260705.md
  // §6) and must not wire rejectManualBankTransferPayment into it.
  const { fake, restore } = await installFakeSupabaseWithAdmin({
    orders: [seedBankTransferOrder({ id: 'order-bt-6' })],
    payments: [{ id: 'pay-8', order_id: 'order-bt-6', provider: 'bank_transfer', status: 'awaiting_transfer', amount: 899, currency: 'TRY', created_at: new Date().toISOString() }]
  });
  try {
    const req = b1PatchRequest('https://local.test/api/admin/orders', 'PATCH', 'cankolsun@gmail.com', { id: 'order-bt-6', action: 'cancel_order' });
    const res = await adminOrdersPatch({ request: req, env: b1AdminEnv(), params: {} });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.bank_transfer_rejection, null, 'cancel_order must not call rejectManualBankTransferPayment in this batch');
    assert.equal(fake.table('orders')[0].status, 'cancelled');
    assert.equal(fake.table('payment_events').length, 0, 'cancel_order must not gain a payment_events row in this batch (out of scope, documented deferral)');
    assert.equal(fake.table('payments')[0].status, 'awaiting_transfer', 'cancel_order must not touch the payments row in this batch (out of scope, documented deferral)');
  } finally { restore(); }

  // Paid-order direct-cancel guard: unchanged by B2, still blocks before
  // rejectManualBankTransferPayment (or any other new B2 code) can run.
  const paid = await installFakeSupabaseWithAdmin({
    orders: [seedBankTransferOrder({ id: 'order-bt-paid-2', status: 'paid', payment_status: 'paid', fulfillment_status: 'preparing' })],
    payments: [{ id: 'pay-9', order_id: 'order-bt-paid-2', provider: 'bank_transfer', status: 'paid', amount: 899, currency: 'TRY', created_at: new Date().toISOString() }]
  });
  try {
    const req = b1PatchRequest('https://local.test/api/admin/orders', 'PATCH', 'cankolsun@gmail.com', { id: 'order-bt-paid-2', action: 'mark_bank_transfer_not_received' });
    const res = await adminOrdersPatch({ request: req, env: b1AdminEnv(), params: {} });
    const data = await res.json();
    assert.equal(res.status, 409, 'the pre-existing paid-order direct-cancel guard must still fire before any B2 code runs');
    assert.equal(data.bank_transfer_rejection, undefined);
    assert.equal(paid.fake.table('payments')[0].status, 'paid');
  } finally { paid.restore(); }
});

test('B2: B1 approval behavior remains fully intact alongside the new rejection helper', async () => {
  const { fake, restore } = await installFakeSupabaseWithAdmin({
    orders: [seedBankTransferOrder({ id: 'order-bt-7' })],
    payments: [{ id: 'pay-10', order_id: 'order-bt-7', provider: 'bank_transfer', status: 'awaiting_transfer', amount: 899, currency: 'TRY', created_at: new Date().toISOString() }],
    coupons: [{ id: 'coupon-1', code: 'FREESHIP' }]
  });
  try {
    const req = b1PatchRequest('https://local.test/api/admin/orders', 'PATCH', 'cankolsun@gmail.com', { id: 'order-bt-7', action: 'mark_payment_paid' });
    const res = await adminOrdersPatch({ request: req, env: b1AdminEnv(), params: {} });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.bank_transfer_confirmation.idempotent, false);
    assert.equal(data.bank_transfer_rejection, null, 'approving an order must never touch the new rejection helper');
    assert.equal(fake.table('orders')[0].payment_status, 'paid');
    assert.equal(fake.table('payment_events')[0].event_type, 'bank_transfer_payment_confirmed');
    assert.equal(fake.table('coupon_redemptions')[0].status, 'used');
    assert.equal(fake.table('invoice_records').length, 1);
  } finally { restore(); }
});

test('B1: card payment (iyzico) callback behavior is unchanged — still calls the payment RPCs, now via the shared commerce-finalization helpers, and never calls confirmManualBankTransferPayment', async () => {
  const source = await fs.readFile(path.join(root, 'functions/api/iyzico-callback.js'), 'utf8');
  assert.match(source, /process_iyzico_payment_success/);
  assert.match(source, /process_iyzico_payment_failure/);
  assert.match(source, /import \{ ensureShipmentShell, finalizeCommerceAfterPayment \} from '\.\/_lib\/commerce-finalization\.js';/);
  assert.match(source, /finalizeCommerceAfterPayment\(context, orderId\)/);
  assert.match(source, /ensureShipmentShell\(context, orderId\)/);
  assert.doesNotMatch(source, /confirmManualBankTransferPayment/);
  assert.doesNotMatch(source, /\basync function finalizeCommerceAfterPayment\b/);
  assert.doesNotMatch(source, /\basync function ensureShipmentShell\b/);
});

// ---------------------------------------------------------------------------
// A1F: Admin RBAC session identity bridge + 403 UX fix.
// ---------------------------------------------------------------------------
const A1F_OWNER = { id: '1', email: 'cankolsun@gmail.com', role: 'owner', role_code: 'owner', permissions: ['*'], is_active: true, status: 'active' };
const A1F_WAREHOUSE = { id: '2', email: 'warehouse@cosmoskin.com.tr', role: 'warehouse', role_code: 'warehouse', permissions: ['inventory:read'], is_active: true, status: 'active' };
function a1fAdminEnv() {
  return { ADMIN_TOKEN: 'a'.repeat(64), ADMIN_SESSION_SECRET: 'b'.repeat(64), ADMIN_ALLOW_LEGACY_TOKEN: 'false', SUPABASE_URL: env.SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY };
}
async function issueA1fSession(adminRow = A1F_OWNER, email = adminRow.email) {
  const adminEnv = a1fAdminEnv();
  const restore = installAdminUsersFetch(adminRow);
  try {
    const issueRequest = new Request('https://local.test/api/admin/session', {
      method: 'POST',
      headers: {
        'x-admin-token': adminEnv.ADMIN_TOKEN,
        'CF-Connecting-IP': '192.0.2.50',
        'Cf-Access-Authenticated-User-Email': email
      }
    });
    const issued = await issueAdminSession({ request: issueRequest, env: adminEnv });
    return { adminEnv, issued };
  } finally {
    restore();
  }
}

test('A1F: admin-runtime.js clears session only on 401, not on 403', async () => {
  const source = await fs.readFile(path.join(root, 'assets/admin-runtime.js'), 'utf8');
  assert.doesNotMatch(source, /response\.status === 401 \|\| response\.status === 403/);
  assert.match(source, /response\.status === 401/);
  assert.match(source, /response\.status === 403/);
  assert.match(source, /showPermissionError\(/);
  assert.match(source, /Bu işlem için yetkiniz bulunmuyor\./);
});

test('A1F: missing Cloudflare Access email during login fails with clear 403', async () => {
  const adminEnv = a1fAdminEnv();
  const restore = installAdminUsersFetch(A1F_OWNER);
  try {
    await assert.rejects(
      issueAdminSession({
        request: new Request('https://local.test/api/admin/session', {
          method: 'POST',
          headers: { 'x-admin-token': adminEnv.ADMIN_TOKEN, 'CF-Connecting-IP': '192.0.2.51' }
        }),
        env: adminEnv
      }),
      (error) => error.status === 403 && /Cloudflare Access kimliği doğrulanamadı/i.test(error.message)
    );
    const req = new Request('https://local.test/api/admin/session', {
      method: 'POST',
      headers: { 'x-admin-token': adminEnv.ADMIN_TOKEN, 'CF-Connecting-IP': '192.0.2.51' }
    });
    const res = await adminSessionPost({ request: req, env: adminEnv, params: {} });
    const data = await res.json();
    assert.equal(res.status, 403);
    assert.match(data.error, /Cloudflare Access kimliği doğrulanamadı/i);
  } finally { restore(); }
});

test('A1F: valid ADMIN_TOKEN + verified Cloudflare email issues identity-bearing session', async () => {
  const { issued } = await issueA1fSession(A1F_OWNER, 'cankolsun@gmail.com');
  assert.equal(issued.token.split('.').length, 5);
  assert.equal(issued.email, 'cankolsun@gmail.com');
});

test('A1F: signed session email allows inventory:read when admin_users owner exists, even without Access header on the API call', async () => {
  const { adminEnv, issued } = await issueA1fSession(A1F_OWNER, 'cankolsun@gmail.com');
  const restore = installFetch(async (url, options = {}) => {
    const href = String(url instanceof Request ? url.url : url);
    if (href.includes('/rest/v1/admin_users')) return response([A1F_OWNER]);
    if (href.includes('/rest/v1/admin_permissions')) return response([]);
    if (href.includes('/rest/v1/products')) return response([]);
    if (href.includes('/rest/v1/inventory')) return response([]);
    return response([]);
  });
  try {
    const req = new Request('https://local.test/api/admin/inventory', {
      headers: { 'x-admin-token': issued.token, 'CF-Connecting-IP': '192.0.2.52' }
    });
    const res = await adminInventoryGet({ request: req, env: adminEnv, params: {} });
    assert.notEqual(res.status, 403);
    assert.equal(await getVerifiedSessionEmail({ request: req, env: adminEnv }), 'cankolsun@gmail.com');
  } finally { restore(); }
});

test('A1F: forged email in request body or x-admin-email header does not grant RBAC', async () => {
  const { adminEnv, issued } = await issueA1fSession(A1F_WAREHOUSE, 'warehouse@cosmoskin.com.tr');
  const restore = installAdminUsersFetch(A1F_WAREHOUSE);
  try {
    const forgedBody = contextFor(new Request('https://local.test/api/admin/inventory', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-admin-token': issued.token,
        'x-admin-email': 'cankolsun@gmail.com'
      },
      body: JSON.stringify({ email: 'cankolsun@gmail.com', role: 'owner', permissions: ['*'] })
    }));
    forgedBody.env = adminEnv;
    assert.equal(await hasAdminPermission(forgedBody, 'admin.users.manage'), false);
  } finally { restore(); }
});

test('A1F: inactive admin email fails session issuance', async () => {
  const adminEnv = a1fAdminEnv();
  const restore = installAdminUsersFetch({ ...A1F_OWNER, is_active: false });
  try {
    await assert.rejects(
      issueAdminSession({
        request: new Request('https://local.test/api/admin/session', {
          method: 'POST',
          headers: {
            'x-admin-token': adminEnv.ADMIN_TOKEN,
            'CF-Connecting-IP': '192.0.2.53',
            'Cf-Access-Authenticated-User-Email': 'cankolsun@gmail.com'
          }
        }),
        env: adminEnv
      }),
      (error) => error.status === 403
    );
  } finally { restore(); }
});

test('A1F: non-owner without inventory:read fails inventory gate', async () => {
  const limited = { id: '3', email: 'reader@cosmoskin.com.tr', role: 'custom', role_code: 'custom', permissions: ['orders:read'], is_active: true, status: 'active' };
  const adminEnv = a1fAdminEnv();
  const restoreIssue = installAdminUsersFetch(limited);
  let issued;
  try {
    issued = await issueAdminSession({
      request: new Request('https://local.test/api/admin/session', {
        method: 'POST',
        headers: {
          'x-admin-token': adminEnv.ADMIN_TOKEN,
          'CF-Connecting-IP': '192.0.2.54',
          'Cf-Access-Authenticated-User-Email': 'reader@cosmoskin.com.tr'
        }
      }),
      env: adminEnv
    });
  } finally { restoreIssue(); }

  const restore = installFetch(async (url) => {
    const href = String(url instanceof Request ? url.url : url);
    if (href.includes('/rest/v1/admin_users')) return response([limited]);
    if (href.includes('/rest/v1/admin_permissions')) return response([]);
    return response([]);
  });
  try {
    const req = new Request('https://local.test/api/admin/inventory', { headers: { 'x-admin-token': issued.token, 'CF-Connecting-IP': '192.0.2.54' } });
    const res = await adminInventoryGet({ request: req, env: adminEnv, params: {} });
    assert.equal(res.status, 403);
  } finally { restore(); }
});

test('A1F: owner permissions [\'*\'] still pass after session identity bridge', async () => {
  const restore = installAdminUsersFetch(A1F_OWNER);
  try {
    const { adminEnv, issued } = await issueA1fSession(A1F_OWNER, 'cankolsun@gmail.com');
    const ctx = { request: new Request('https://local.test/api/admin/inventory', { headers: { 'x-admin-token': issued.token } }), env: adminEnv };
    assert.equal(await hasAdminPermission(ctx, 'inventory:read'), true);
    assert.equal(await hasAdminPermission(ctx, 'admin.users.manage'), true);
  } finally { restore(); }
});

test('A1F: dashboard remains assertAdmin-only and inventory remains permission-gated', async () => {
  const dashboardSrc = await fs.readFile(path.join(root, 'functions/api/admin/dashboard.js'), 'utf8');
  const inventorySrc = await fs.readFile(path.join(root, 'functions/api/admin/inventory.js'), 'utf8');
  assert.match(dashboardSrc, /assertAdmin\(context\)/);
  assert.doesNotMatch(dashboardSrc, /requireAdminPermission\(/);
  assert.match(inventorySrc, /requireAdminPermission\(context,\s*['"]inventory:read['"]\)/);
});

test('A1F: invalid admin token still returns 401 and does not issue a session', async () => {
  const adminEnv = a1fAdminEnv();
  const restore = installAdminUsersFetch(A1F_OWNER);
  try {
    await assert.rejects(
      assertAdmin({
        request: new Request('https://local.test/api/admin/dashboard', { headers: { 'x-admin-token': 'wrong-token', 'CF-Connecting-IP': '192.0.2.55' } }),
        env: adminEnv
      }),
      (error) => error.status === 401
    );
  } finally { restore(); }
});

// ---------------------------------------------------------------------------
// A1F2: Cloudflare Access JWT email fallback for admin RBAC session issuance.
// ---------------------------------------------------------------------------
const A1F2_TEAM = 'cosmoskin-test';
const A1F2_AUD = 'test-access-audience';

function a1f2AdminEnv(extra = {}) {
  return { ...a1fAdminEnv(), CF_ACCESS_TEAM_DOMAIN: A1F2_TEAM, CF_ACCESS_AUD: A1F2_AUD, ...extra };
}

async function generateTestAccessKeyPair() {
  return crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([0x01, 0x00, 0x01]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
}

async function exportPublicAccessJwk(keyPair, kid = 'test-kid') {
  const jwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  return { ...jwk, kid, use: 'sig', alg: 'RS256' };
}

async function createTestAccessJwt(keyPair, { email, teamDomain = A1F2_TEAM, aud = A1F2_AUD, kid = 'test-kid', expOffset = 3600, includeEmail = true }) {
  const header = { alg: 'RS256', kid };
  const payload = {
    aud,
    exp: Math.floor(Date.now() / 1000) + expOffset,
    iat: Math.floor(Date.now() / 1000),
    iss: `https://${teamDomain}.cloudflareaccess.com`,
    sub: includeEmail ? email : 'missing-email-subject',
  };
  if (includeEmail) payload.email = email;
  const encode = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const encodedHeader = encode(header);
  const encodedPayload = encode(payload);
  const data = new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keyPair.privateKey, data);
  const encodedSignature = Buffer.from(signature).toString('base64url');
  return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
}

function installAccessCertsFetch(publicJwk) {
  return installFetch(async (url) => {
    const href = String(url instanceof Request ? url.url : url);
    if (href.includes('/cdn-cgi/access/certs')) return response({ keys: [publicJwk] });
    if (href.includes('/rest/v1/admin_users')) return response([A1F_OWNER]);
    if (href.includes('/rest/v1/admin_permissions')) return response([]);
    if (href.includes('/rest/v1/products')) return response([]);
    if (href.includes('/rest/v1/inventory')) return response([]);
    return response([]);
  });
}

test('A1F2: direct Cf-Access-Authenticated-User-Email still works for session issuance', async () => {
  const { issued } = await issueA1fSession(A1F_OWNER, 'cankolsun@gmail.com');
  assert.equal(issued.email, 'cankolsun@gmail.com');
});

test('A1F2: Cf-Access-Jwt-Assertion fallback works when direct email header is absent', async () => {
  const keyPair = await generateTestAccessKeyPair();
  const publicJwk = await exportPublicAccessJwk(keyPair);
  const adminEnv = a1f2AdminEnv();
  const restoreUsers = installAdminUsersFetch(A1F_OWNER);
  const restoreFetch = installAccessCertsFetch(publicJwk);
  try {
    clearAccessCertsCacheForTests();
    const jwt = await createTestAccessJwt(keyPair, { email: 'cankolsun@gmail.com' });
    const issued = await issueAdminSession({
      request: new Request('https://local.test/api/admin/session', {
        method: 'POST',
        headers: {
          'x-admin-token': adminEnv.ADMIN_TOKEN,
          'CF-Connecting-IP': '192.0.2.60',
          'Cf-Access-Jwt-Assertion': jwt,
        },
      }),
      env: adminEnv,
    });
    assert.equal(issued.email, 'cankolsun@gmail.com');
    assert.equal(issued.token.split('.').length, 5);
  } finally {
    restoreFetch();
    restoreUsers();
    clearAccessCertsCacheForTests();
  }
});

test('A1F2: unverified/forged JWT fails session issuance', async () => {
  const keyPair = await generateTestAccessKeyPair();
  const otherKeyPair = await generateTestAccessKeyPair();
  const publicJwk = await exportPublicAccessJwk(keyPair);
  const adminEnv = a1f2AdminEnv();
  const restoreUsers = installAdminUsersFetch(A1F_OWNER);
  const restoreFetch = installAccessCertsFetch(publicJwk);
  try {
    clearAccessCertsCacheForTests();
    const jwt = await createTestAccessJwt(otherKeyPair, { email: 'cankolsun@gmail.com' });
    await assert.rejects(
      issueAdminSession({
        request: new Request('https://local.test/api/admin/session', {
          method: 'POST',
          headers: {
            'x-admin-token': adminEnv.ADMIN_TOKEN,
            'CF-Connecting-IP': '192.0.2.61',
            'Cf-Access-Jwt-Assertion': jwt,
          },
        }),
        env: adminEnv,
      }),
      (error) => error.status === 403
    );
  } finally {
    restoreFetch();
    restoreUsers();
    clearAccessCertsCacheForTests();
  }
});

test('A1F2: JWT with wrong audience fails when audience config is present', async () => {
  const keyPair = await generateTestAccessKeyPair();
  const publicJwk = await exportPublicAccessJwk(keyPair);
  const adminEnv = a1f2AdminEnv();
  const restoreUsers = installAdminUsersFetch(A1F_OWNER);
  const restoreFetch = installAccessCertsFetch(publicJwk);
  try {
    clearAccessCertsCacheForTests();
    const jwt = await createTestAccessJwt(keyPair, { email: 'cankolsun@gmail.com', aud: 'wrong-audience' });
    await assert.rejects(
      issueAdminSession({
        request: new Request('https://local.test/api/admin/session', {
          method: 'POST',
          headers: {
            'x-admin-token': adminEnv.ADMIN_TOKEN,
            'CF-Connecting-IP': '192.0.2.62',
            'Cf-Access-Jwt-Assertion': jwt,
          },
        }),
        env: adminEnv,
      }),
      (error) => error.status === 403
    );
  } finally {
    restoreFetch();
    restoreUsers();
    clearAccessCertsCacheForTests();
  }
});

test('A1F2: JWT without email claim fails', async () => {
  const keyPair = await generateTestAccessKeyPair();
  const publicJwk = await exportPublicAccessJwk(keyPair);
  const adminEnv = a1f2AdminEnv();
  const restoreUsers = installAdminUsersFetch(A1F_OWNER);
  const restoreFetch = installAccessCertsFetch(publicJwk);
  try {
    clearAccessCertsCacheForTests();
    const jwt = await createTestAccessJwt(keyPair, { email: 'cankolsun@gmail.com', includeEmail: false });
    await assert.rejects(
      issueAdminSession({
        request: new Request('https://local.test/api/admin/session', {
          method: 'POST',
          headers: {
            'x-admin-token': adminEnv.ADMIN_TOKEN,
            'CF-Connecting-IP': '192.0.2.63',
            'Cf-Access-Jwt-Assertion': jwt,
          },
        }),
        env: adminEnv,
      }),
      (error) => error.status === 403
    );
  } finally {
    restoreFetch();
    restoreUsers();
    clearAccessCertsCacheForTests();
  }
});

test('A1F2: JWT-only identity resolves through resolveCloudflareAccessEmail()', async () => {
  const keyPair = await generateTestAccessKeyPair();
  const publicJwk = await exportPublicAccessJwk(keyPair);
  const adminEnv = a1f2AdminEnv();
  const restoreFetch = installAccessCertsFetch(publicJwk);
  try {
    clearAccessCertsCacheForTests();
    const jwt = await createTestAccessJwt(keyPair, { email: 'cankolsun@gmail.com' });
    const email = await resolveCloudflareAccessEmail({
      request: new Request('https://local.test/api/admin/session', {
        headers: { 'Cf-Access-Jwt-Assertion': jwt },
      }),
      env: adminEnv,
    });
    assert.equal(email, 'cankolsun@gmail.com');
  } finally {
    restoreFetch();
    clearAccessCertsCacheForTests();
  }
});

test('P1A: canonical catalog prices align across products.json, browser fallback, and server catalog', async () => {
  const {
    loadCanonicalCatalog,
    extractBrowserFallbackCatalog,
    loadServerCatalog,
    compareCatalogDocuments
  } = await import('../scripts/lib/product-price-catalog.mjs');

  const canonical = loadCanonicalCatalog();
  const browser = extractBrowserFallbackCatalog();
  const server = await loadServerCatalog();

  assert.equal(canonical.slugs.size, 35);
  assert.deepEqual([...compareCatalogDocuments(canonical, browser, 'assets/products-data.js')], []);
  assert.deepEqual([...compareCatalogDocuments(canonical, server, 'functions/api/_lib/products-data.js')], []);

  const catalogModule = await import('../functions/api/_lib/catalog.js');
  const runtime = catalogModule.catalog['anua-heartleaf-77-soothing-toner'];
  assert.equal(runtime.price, canonical.bySlug.get('anua-heartleaf-77-soothing-toner').price);
});

test('P1A: drift validator script passes on current catalog sources', async () => {
  const { spawnSync } = await import('node:child_process');
  const result = spawnSync(process.execPath, ['scripts/validate-p1a-product-price-source-drift.mjs'], {
    cwd: path.join(path.dirname(fileURLToPath(import.meta.url)), '..'),
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /P1A product price source drift validation passed/);
});

test('A1F2: missing team domain fails closed when only JWT header is present', async () => {
  const adminEnv = a1fAdminEnv();
  await assert.rejects(
    issueAdminSession({
      request: new Request('https://local.test/api/admin/session', {
        method: 'POST',
        headers: {
          'x-admin-token': adminEnv.ADMIN_TOKEN,
          'CF-Connecting-IP': '192.0.2.64',
          'Cf-Access-Jwt-Assertion': 'eyJhbGciOiJSUzI1NiJ9.eyJpc3MiOiJodHRwczovL3RlYW0uY2xvdWRmbGFyZWFjY2Vzcy5jb20ifQ.sig',
        },
      }),
      env: adminEnv,
    }),
    (error) => error.status === 403 && /CF_ACCESS_TEAM_DOMAIN/i.test(error.message)
  );
});
