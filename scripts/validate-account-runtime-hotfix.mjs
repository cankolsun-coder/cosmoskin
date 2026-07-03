import fs from 'node:fs';
const read = (p) => fs.readFileSync(p, 'utf8');
const checks = [];
function ok(condition, message){ if(!condition) checks.push(message); }
const favApi = read('functions/api/account/favorites.js');
ok(/isUuid/.test(favApi) && /product_slug/.test(favApi), 'favorites API must distinguish UUID from product slug');
const account = read('assets/account-dashboard.js');
ok(/uniqueFavoriteList/.test(account), 'account favorites must merge local/db favorite source');
ok(!/h\.focus\(\{\s*preventScroll:\s*true\s*\}\)/.test(account), 'account headings must not auto focus and show blue outline');
ok(/requested_attachments/.test(read('functions/api/returns.js')), 'returns API must persist attachment snapshot');
ok(/returnAttachments/.test(read('functions/api/account/summary.js')) || /requested_attachments/.test(read('functions/api/account/summary.js')), 'account summary must include return attachments');
ok(/full_name/.test(read('functions/api/contact.js')) && /String\(values\.first_name/.test(read('functions/api/contact.js')), 'contact API must support full_name forms safely');
ok(/return_request/.test(read('functions/api/account/support-requests.js')), 'account support must accept return_request category');
ok(/Account runtime polish/.test(read('assets/account-premium.css')), 'account runtime polish CSS must be present');
if(checks.length){ console.error(checks.map((m)=>`- ${m}`).join('\n')); process.exit(1); }
console.log('COSMOSKIN account runtime hotfix validation passed.');
