import fs from 'node:fs';

function read(path){ return fs.readFileSync(path, 'utf8'); }
function assert(condition, message){ if(!condition){ console.error('Return attachment/success validation failed:', message); process.exit(1); } }

const adminApi = read('functions/api/admin/returns.js');
const adminJs = read('assets/admin-returns.js');
const accountJs = read('assets/account-dashboard.js');
const supabaseLib = read('functions/api/_lib/supabase.js');

assert(supabaseLib.includes('createSignedStorageUrl'), 'Supabase helper must expose createSignedStorageUrl.');
assert(adminApi.includes('withSignedAttachmentUrls'), 'Admin returns API must hydrate attachment signed URLs.');
assert(adminApi.includes('createSignedStorageUrl'), 'Admin returns API must call signed storage URL helper.');
assert(adminJs.includes('file_preview_url') && adminJs.includes('<img'), 'Admin returns UI must render image previews from signed URLs.');
assert(accountJs.includes('returnSuccessMessage'), 'Account returns UI must show success feedback after create.');
assert(accountJs.includes("searchParams.delete('createReturn')"), 'Account returns UI must remove createReturn URL param after success.');
assert(accountJs.includes('İade detayını görüntüle'), 'Customer return cards must expose details after creation.');

console.log('COSMOSKIN return attachment/success hotfix validation passed.');
