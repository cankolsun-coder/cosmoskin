import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const fail = [];
const warn = [];
function read(file){ return fs.readFileSync(path.join(root,file),'utf8'); }
function exists(file){ return fs.existsSync(path.join(root,file)); }
function assert(cond,msg){ if(!cond) fail.push(msg); }
function list(dir, pred=()=>true){ return fs.existsSync(path.join(root,dir)) ? fs.readdirSync(path.join(root,dir)).filter(pred).map(f=>path.join(dir,f)) : []; }

const accountDash = read('assets/account-dashboard.js');
const returnsApi = read('functions/api/returns.js');
const adminReturns = exists('assets/admin-returns.js') ? read('assets/admin-returns.js') : '';
const migrationFiles = list('supabase/migrations', f=>f.endsWith('.sql'));
const migrationText = migrationFiles.map(read).join('\n');
const productFiles = list('products', f=>f.endsWith('.html'));
const productText = productFiles.map(read).join('\n');

assert(exists('functions/api/returns.js'), 'functions/api/returns.js bulunamadı.');
assert(exists('functions/api/admin/returns.js'), 'functions/api/admin/returns.js bulunamadı.');
assert(exists('assets/account-returns.js'), 'assets/account-returns.js bulunamadı.');
assert(exists('assets/admin-returns.js'), 'assets/admin-returns.js bulunamadı.');
assert(/İade Talebi Oluştur/.test(accountDash), 'Hesabım iade CTA eksik.');
assert(/İade Taleplerim/.test(accountDash), 'İade Taleplerim isimlendirmesi eksik.');
assert(!/İade ve Taleplerim/.test(accountDash), 'Eski İade ve Taleplerim ifadesi account-dashboard içinde kalmış.');
assert(/support_requests/.test(accountDash) && /return_requests|\/returns/.test(accountDash), 'Destek ve iade veri kaynakları ayrımı görünmüyor.');
assert(/return_request_items/.test(migrationText), 'return_request_items migration/schema referansı eksik.');
assert(/return_request_attachments/.test(migrationText), 'return_request_attachments migration/schema referansı eksik.');
assert(/return_status_events/.test(migrationText), 'return_status_events migration/schema referansı eksik.');
assert(/Ürün hasarlı geldi/.test(returnsApi) && /attachments/.test(returnsApi), 'Attachment zorunluluk logic’i returns API içinde görünmüyor.');
assert(!/DHL\s*(iade)?\s*kodu\s*[:=]\s*['"][A-Z0-9-]{4,}/i.test([returnsApi, adminReturns, accountDash].join('\n')), 'Hardcoded DHL iade kodu şüphesi var.');
assert(!/TR\d{2}\s?\d{4}\s?\d{4}/.test([returnsApi, adminReturns, accountDash].join('\n')), 'Hardcoded IBAN geri gelmiş olabilir.');
assert(/renderFavorites/.test(accountDash), 'Account favorites render fonksiyonu yok.');
assert(/campaign_emails/.test(accountDash) && /campaign_emails/.test(migrationText), 'campaign_emails schema uyumu eksik.');
assert(!/\bSelect\b|\bSilver\b/.test(accountDash), 'Eski Club seviyesi Select/Silver account dashboard içinde kalmış.');
assert(!/Essantial/.test(accountDash + productText), 'Essantial yazım hatası kalmış.');
assert(/cs-tier-card--essential/.test(accountDash) && /cs-tier-card--signature/.test(accountDash) && /cs-tier-card--elite/.test(accountDash), 'Essential/Signature/Elite renk sınıfları eksik.');
assert(!/Ürün Rehberi|Ürün rehberi|cs-guide\b|phase52-pdp-meta/.test(productText), 'PDP ürün rehberi bölümü kalmış.');
assert(/Cilt Profilime Uygun mu\?/.test(productText + read('assets/pdp-professional.js')), 'PDP Cilt Profilime Uygun mu tabı bulunamadı.');
assert(/pdp8-faq-enhanced/.test(productText), 'PDP Merak edilenler alanı detaylandırılmamış.');
assert(!/label\.innerHTML='<input type="checkbox" aria-label="Sadece stokta olan ürünleri göster"> Stokta var'/.test(exists('assets/cosmoskin-phase3.js') ? read('assets/cosmoskin-phase3.js') : ''), 'PLP Stokta var kutucuğu kalıntısı var.');
assert(!/(TCKN|tc kimlik|T\.C\. kimlik)/i.test([accountDash, returnsApi, adminReturns].join('\n')), 'Public TCKN/kimlik ifadesi riski var.');

if (fail.length) {
  console.error('COSMOSKIN customer returns/account/PDP polish validation failed:');
  fail.forEach((msg)=>console.error(' - ' + msg));
  process.exit(1);
}
console.log(`COSMOSKIN customer returns/account/PDP polish validation passed: ${productFiles.length} product pages, ${migrationFiles.length} migrations checked.`);
