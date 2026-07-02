
import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const fail = (msg) => { console.error(`COSMOSKIN return attachment persistence validation failed: ${msg}`); process.exit(1); };
const returnsApi = read('functions/api/returns.js');
if (/return_request_items'[^;]+catch\(\(\)=>null\)/s.test(returnsApi)) fail('return_request_items insert failure is swallowed');
if (/return_request_attachments'[^;]+catch\(\(\)=>null\)/s.test(returnsApi)) fail('return_request_attachments insert failure is swallowed');
if (!returnsApi.includes("await insertRows(context,'return_request_attachments'")) fail('attachment insert is not explicit/awaited');
const account = read('assets/account-dashboard.js');
if (!account.includes('r.items && r.items.length ? r.items : r.requested_items')) fail('customer returns do not fallback to requested_items');
if (!account.includes('Ek dosya kaydı hazırlanamadı')) fail('customer attachment persistence warning missing');
const admin = read('assets/admin-returns.js');
if (!admin.includes('r.items&&r.items.length?r.items')) fail('admin return items fallback missing');
if (!admin.includes('return_request_attachments kaydı kontrol edilmeli')) fail('admin attachment persistence warning missing');
console.log('COSMOSKIN return attachment persistence validation passed.');
