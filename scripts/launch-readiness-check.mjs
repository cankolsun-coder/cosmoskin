import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (name === 'node_modules' || name === '__MACOSX' || name === '.git') continue;
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
function rel(p) { return path.relative(root, p).replace(/\\/g, '/'); }
const files = walk(root);
const htmlFiles = files.filter((p) => p.endsWith('.html'));
const jsFiles = files.filter((p) => p.endsWith('.js') || p.endsWith('.mjs'));
const sqlText = files.filter((p) => p.endsWith('.sql')).map((p) => fs.readFileSync(p, 'utf8')).join('\n');
const findings = [];
function add(severity, code, message, file = null) { findings.push({ severity, code, message, file }); }

// Table existence check
for (const table of ['profiles','order_legal_consents','order_legal_snapshots','legal_document_versions','membership_levels','loyalty_points_ledger','customer_coupons','admin_activity_logs','shipping_settings']) {
  if (!new RegExp(`create\\s+table\\s+if\\s+not\\s+exists\\s+(?:public\\.)?${table}\\b`, 'i').test(sqlText)) {
    add('error', 'missing_table_migration', `Missing migration definition for ${table}`);
  }
}

// Public sensitive config scan
const publicConfig = fs.existsSync('assets/site-config.js') ? fs.readFileSync('assets/site-config.js', 'utf8') : '';
for (const forbidden of ['bankAccounts:', 'COSMOSKIN_BANK_ACCOUNTS', 'returnAddress:', 'kepAddress:', 'businessAddress:', 'legalNoticeAddress:', 'cargoProvider:']) {
  if (publicConfig.includes(forbidden)) add('error', 'public_sensitive_config', `Public site-config still contains ${forbidden}`, 'assets/site-config.js');
}

// Legal modal injection and checkout no-navigation
if (!fs.existsSync('assets/legal-modal.js') || !fs.existsSync('assets/legal-modal.css')) add('error', 'legal_modal_missing', 'Legal modal assets are missing');
const checkoutFlow = fs.existsSync('assets/checkout-flow.js') ? fs.readFileSync('assets/checkout-flow.js', 'utf8') : '';
for (const pattern of ['target="_blank" rel="noopener">Ön Bilgilendirme', 'target="_blank" rel="noopener">Mesafeli', 'target="_blank" rel="noopener">KVKK']) {
  if (checkoutFlow.includes(pattern)) add('error', 'checkout_legal_navigation', `Checkout legal anchor still opens new page: ${pattern}`, 'assets/checkout-flow.js');
}
for (const doc of ['data-legal-document="on-bilgilendirme-formu"','data-legal-document="mesafeli-satis-sozlesmesi"','data-legal-document="kvkk-aydinlatma-metni"']) {
  if (!checkoutFlow.includes(doc)) add('error', 'checkout_legal_modal_marker_missing', `Checkout missing ${doc}`, 'assets/checkout-flow.js');
}

// Sitemap private routes
const sitemap = fs.existsSync('sitemap.xml') ? fs.readFileSync('sitemap.xml', 'utf8') : '';
for (const privatePath of ['/checkout.html','/cart.html','/favorites.html','/order-tracking.html','/account/','/admin/','/auth/','/payment']) {
  if (sitemap.includes(privatePath)) add('error', 'sitemap_private_route', `Sitemap includes private route ${privatePath}`, 'sitemap.xml');
}

// Duplicate ID scan per HTML file (warnings only because many legacy modals share templates per page but should not duplicate within page)
for (const file of htmlFiles) {
  const text = fs.readFileSync(file, 'utf8');
  const ids = [...text.matchAll(/(?:^|[\s<])id=["']([^"']+)["']/g)].map((m) => m[1]);
  const seen = new Set();
  const dup = new Set();
  ids.forEach((id) => { if (seen.has(id)) dup.add(id); else seen.add(id); });
  if (dup.size) add('warning', 'duplicate_ids', `Duplicate ids: ${[...dup].slice(0, 12).join(', ')}`, rel(file));
  if (!rel(file).startsWith('snippets/') && !text.includes('/assets/legal-modal.js')) add('warning', 'legal_modal_not_injected', 'Legal modal script not injected', rel(file));
}

// Admin/customer no-store
const headers = fs.existsSync('_headers') ? fs.readFileSync('_headers', 'utf8') : '';
for (const required of ['/api/*','/admin/*','/account/*','/checkout.html']) {
  if (!headers.includes(required)) add('error', 'headers_missing_sensitive_route', `Missing _headers block for ${required}`, '_headers');
}

// JS syntax-ish import path scan for obvious wrong relative _lib paths
for (const file of jsFiles) {
  const text = fs.readFileSync(file, 'utf8');
  for (const m of text.matchAll(/from ['"]([^'"]*_lib\/[^'"]+)['"]/g)) {
    const target = path.normalize(path.join(path.dirname(file), m[1]));
    if (!fs.existsSync(target)) add('error', 'broken_import_path', `Broken import ${m[1]}`, rel(file));
  }
}

const summary = {
  ok: !findings.some((f) => f.severity === 'error'),
  errors: findings.filter((f) => f.severity === 'error').length,
  warnings: findings.filter((f) => f.severity === 'warning').length,
  checked: { html: htmlFiles.length, js: jsFiles.length },
  findings
};
fs.writeFileSync('COSMOSKIN_LAUNCH_READINESS_QA_20260626.json', JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
if (summary.errors) process.exitCode = 1;
