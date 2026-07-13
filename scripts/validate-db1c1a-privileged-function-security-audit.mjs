#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const deliverables = [
  'COSMOSKIN_DB1C1A_PRIVILEGED_FUNCTION_SECURITY_AUDIT_20260712.md',
  'COSMOSKIN_DB1C1A_FUNCTION_CALL_PATH_MATRIX_20260712.csv',
  'COSMOSKIN_DB1C1A_FUNCTION_GRANT_DECISION_MATRIX_20260712.csv',
  'COSMOSKIN_DB1C1A_TRIGGER_DEPENDENCY_MATRIX_20260712.csv',
  'COSMOSKIN_DB1C1A_PRIVILEGED_FUNCTION_LIVE_VERIFICATION_QUERIES_20260712.sql',
  'COSMOSKIN_DB1C1A_SEARCH_PATH_HARDENING_PLAN_20260712.md',
  'COSMOSKIN_DB1C1A_DB1C1B_MIGRATION_DESIGN_20260712.md',
  'COSMOSKIN_DB1C1A_RUNBOOK_20260712.md',
  'COSMOSKIN_DB1C1A_ROLLBACK_AND_STOP_CONDITIONS_20260712.md'
];
const validatorPath = 'scripts/validate-db1c1a-privileged-function-security-audit.mjs';
const allowedChanges = new Set([...deliverables, validatorPath]);
const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

for (const file of deliverables) assert(fs.existsSync(path.join(root, file)), `missing deliverable: ${file}`);

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { value += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else value += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(value); value = ''; }
    else if (char === '\n') { row.push(value); rows.push(row); row = []; value = ''; }
    else if (char !== '\r') value += char;
  }
  if (value || row.length) { row.push(value); rows.push(row); }
  return rows.filter(items => items.some(item => item !== ''));
}

function walk(dir, extensions) {
  const output = [];
  if (!fs.existsSync(dir)) return output;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git', '.wrangler', '.codex', 'node_modules'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) output.push(...walk(full, extensions));
    else if (extensions.some(extension => entry.name.endsWith(extension))) output.push(full);
  }
  return output;
}

const audit = read('COSMOSKIN_DB1C1A_PRIVILEGED_FUNCTION_SECURITY_AUDIT_20260712.md');
for (const requiredText of [
  '33 `SECURITY DEFINER` functions',
  '20 of 33 definers have PUBLIC EXECUTE',
  '21 of 33 are effectively executable by `anon`',
  '21 of 33 are effectively executable by `authenticated`',
  '12 are already restricted to `postgres`/`service_role`',
  'eight `SECURITY DEFINER` functions attached to normal table triggers',
  'returned no rows',
  'rls_auto_enable()',
  '10 definers without an explicit path',
  '22 with `search_path=public`',
  'one with `search_path=pg_catalog`'
]) assert(audit.includes(requiredText), `audit missing live evidence text: ${requiredText}`);

const expectedLiveFunctions = new Set([
  'check_purchase','cleanup_old_notifications','convert_order_inventory','cosmoskin_activity_offer_insert',
  'cosmoskin_activity_order_insert','cosmoskin_activity_order_update','cosmoskin_activity_points_insert',
  'cosmoskin_activity_routine_complete','cosmoskin_award_loyalty_for_order','cosmoskin_loyalty_balance_for_user',
  'cosmoskin_order_points_basis','cosmoskin_promote_due_loyalty_points','cosmoskin_promote_loyalty_for_order',
  'cosmoskin_reverse_loyalty_for_order','create_account_activity','get_review_summary','handle_new_auth_user_profile',
  'handle_new_user','handle_new_user_profile','loyalty_ledger_recalculate_trigger','process_iyzico_payment_failure',
  'process_iyzico_payment_success','recalculate_customer_membership','recalculate_loyalty_account',
  'recalculate_routine_streak','refresh_inventory_estimate','release_expired_inventory_reservations',
  'release_order_inventory','reserve_order_inventory','reserve_product_inventory','rls_auto_enable',
  'routine_completion_recalculate_trigger','sync_review_helpful_count'
]);

const callRows = parseCsv(read('COSMOSKIN_DB1C1A_FUNCTION_CALL_PATH_MATRIX_20260712.csv'));
const grantRows = parseCsv(read('COSMOSKIN_DB1C1A_FUNCTION_GRANT_DECISION_MATRIX_20260712.csv'));
const triggerRows = parseCsv(read('COSMOSKIN_DB1C1A_TRIGGER_DEPENDENCY_MATRIX_20260712.csv'));
assert(callRows[0]?.includes('exact_function_signature'), 'call-path matrix lacks exact_function_signature');
assert(grantRows[0]?.includes('exact_function_signature'), 'grant matrix lacks exact_function_signature');
assert(triggerRows[0]?.includes('exact_function_signature'), 'trigger matrix lacks exact_function_signature');
assert(callRows.length - 1 === 33, `call-path matrix must contain 33 live definers; found ${callRows.length - 1}`);
assert(grantRows.length - 1 === 33, `grant matrix must contain 33 live definers; found ${grantRows.length - 1}`);

const grantHeader = grantRows[0] || [];
const grantNameIndex = grantHeader.indexOf('function_name');
const grantSignatureIndex = grantHeader.indexOf('exact_function_signature');
const publicIndex = grantHeader.indexOf('current_public_execute');
const anonIndex = grantHeader.indexOf('current_anon_execute');
const authenticatedIndex = grantHeader.indexOf('current_authenticated_execute');
const serviceRoleIndex = grantHeader.indexOf('current_service_role_execute');
const aclClassIndex = grantHeader.indexOf('current_acl_class');
const grantNames = new Set();
const grantSignatures = new Set();
for (const row of grantRows.slice(1)) {
  const name = row[grantNameIndex];
  const signature = row[grantSignatureIndex];
  grantNames.add(name);
  grantSignatures.add(signature);
  assert(/^public\.[a-z_][a-z0-9_]*\([^<>]*\)$/i.test(signature), `grant row lacks an exact public signature: ${signature}`);
}
assert(grantNames.size === 33, `grant matrix must contain 33 unique function names; found ${grantNames.size}`);
assert(grantSignatures.size === 33, `grant matrix must contain 33 unique exact signatures; found ${grantSignatures.size}`);
for (const name of expectedLiveFunctions) assert(grantNames.has(name), `live definer missing from grant matrix: ${name}`);
const publicExposureCount = grantRows.slice(1).filter(row => row[publicIndex] === 'Yes').length;
const anonExposureCount = grantRows.slice(1).filter(row => row[anonIndex]?.startsWith('Yes')).length;
const authenticatedExposureCount = grantRows.slice(1).filter(row => row[authenticatedIndex]?.startsWith('Yes')).length;
const serviceRoleExposureCount = grantRows.slice(1).filter(row => row[serviceRoleIndex] === 'Yes').length;
const restrictedCount = grantRows.slice(1).filter(row => row[aclClassIndex] === 'Restricted to postgres/service_role').length;
assert(publicExposureCount === 20, `grant matrix PUBLIC exposure count must be 20; found ${publicExposureCount}`);
assert(anonExposureCount === 21, `grant matrix anon exposure count must be 21; found ${anonExposureCount}`);
assert(authenticatedExposureCount === 21, `grant matrix authenticated exposure count must be 21; found ${authenticatedExposureCount}`);
assert(serviceRoleExposureCount === 33, `grant matrix service_role exposure count must be 33; found ${serviceRoleExposureCount}`);
assert(restrictedCount === 12, `grant matrix restricted count must be 12; found ${restrictedCount}`);
const cleanupRow = grantRows.slice(1).find(row => row[grantNameIndex] === 'cleanup_old_notifications');
assert(cleanupRow?.[publicIndex] === 'No' && cleanupRow?.[anonIndex] === 'Yes (direct)' && cleanupRow?.[authenticatedIndex] === 'Yes (direct)', 'cleanup_old_notifications special direct-role ACL case is not represented exactly');

const callHeader = callRows[0] || [];
const callSignatureIndex = callHeader.indexOf('exact_function_signature');
const callSignatures = new Set(callRows.slice(1).map(row => row[callSignatureIndex]));
assert(callSignatures.size === 33, `call-path matrix must contain 33 unique exact signatures; found ${callSignatures.size}`);
for (const signature of grantSignatures) assert(callSignatures.has(signature), `grant signature missing from call-path matrix: ${signature}`);

const triggerHeader = triggerRows[0] || [];
const confirmedIndex = triggerHeader.indexOf('confirmed_normal_trigger');
const triggerSignatureIndex = triggerHeader.indexOf('exact_function_signature');
const confirmedTriggers = triggerRows.slice(1).filter(row => row[confirmedIndex] === 'Yes');
assert(confirmedTriggers.length === 8, `trigger matrix must document 8 confirmed normal triggers; found ${confirmedTriggers.length}`);
for (const row of triggerRows.slice(1)) {
  assert(/^public\.[a-z_][a-z0-9_]*\([^<>]*\)$/i.test(row[triggerSignatureIndex]), `trigger row lacks exact signature: ${row[triggerSignatureIndex]}`);
}
assert(read('COSMOSKIN_DB1C1A_TRIGGER_DEPENDENCY_MATRIX_20260712.csv').includes('supplemental pg_event_trigger query returned no rows'), 'trigger matrix lacks no-rows event-trigger result');

const sqlSources = [
  ...walk(path.join(root, 'supabase'), ['.sql']),
  ...fs.readdirSync(root).filter(name => name.endsWith('.sql') && !name.startsWith('COSMOSKIN_DB1')).map(name => path.join(root, name))
];
const repositoryDefiners = new Set();
for (const file of sqlSources) {
  const sql = fs.readFileSync(file, 'utf8');
  const starts = [...sql.matchAll(/\b(?:create\s+or\s+replace\s+function|create\s+function)\s+(?:(\w+)\.)?(\w+)\s*\(/gi)];
  for (let index = 0; index < starts.length; index += 1) {
    const start = starts[index];
    const end = starts[index + 1]?.index ?? sql.length;
    if (/\bsecurity\s+definer\b/i.test(sql.slice(start.index, end))) repositoryDefiners.add(start[2]);
  }
}
assert(repositoryDefiners.size === 18, `expected 18 repository SECURITY DEFINER names; found ${repositoryDefiners.size}`);
for (const name of repositoryDefiners) assert(grantNames.has(name), `repository definer missing from grant matrix: ${name}`);

const directRpcNames = new Set();
for (const scope of ['functions', 'assets', 'tests', 'scripts']) {
  for (const file of walk(path.join(root, scope), ['.js', '.mjs', '.ts'])) {
    if (file.endsWith(path.basename(import.meta.filename))) continue;
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(/(?:\brpc\s*\(\s*[^,]+,\s*|\.rpc\s*\(\s*)['"]([a-zA-Z0-9_]+)['"]/g)) directRpcNames.add(match[1]);
    for (const match of source.matchAll(/\/rpc\/([a-zA-Z0-9_]+)/g)) directRpcNames.add(match[1]);
  }
}
assert(directRpcNames.size === 12, `expected 12 direct RPC names; found ${directRpcNames.size}`);
for (const name of directRpcNames) assert(grantNames.has(name), `direct RPC missing from matrices: ${name}`);

const liveSql = read('COSMOSKIN_DB1C1A_PRIVILEGED_FUNCTION_LIVE_VERIFICATION_QUERIES_20260712.sql');
for (let query = 1; query <= 12; query += 1) assert(liveSql.includes(`-- Q${query}.`), `SQL pack missing Q${query}`);
assert(liveSql.includes('-- SUPPLEMENT A.'), 'SQL pack missing compact exact ACL supplement');
assert(liveSql.includes('-- SUPPLEMENT B.'), 'SQL pack missing event-trigger supplement');
assert(liveSql.includes('-- OPTIONAL Q13.'), 'SQL pack missing optional Q13 label');
assert(liveSql.includes('FROM pg_event_trigger AS e'), 'SQL pack missing pg_event_trigger verification');

const uncommented = liveSql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*--.*$/gm, '');
const statements = uncommented.split(';').map(statement => statement.trim()).filter(Boolean);
assert(statements.length === 14, `expected 14 executable read-only statements; found ${statements.length}`);
for (const [index, statement] of statements.entries()) assert(/^(select|with)\b/i.test(statement), `SQL statement ${index + 1} is not SELECT/WITH SELECT`);
const withoutStrings = uncommented.replace(/'(?:''|[^'])*'/g, "''");
assert(!/\b(insert|update|delete|alter|create|drop|grant|revoke|truncate|merge|call|do|copy)\b/i.test(withoutStrings), 'SQL pack contains an executable mutation keyword');
assert(!/(?:\~|similar\s+to|\(\?:|\\m|\\M)/i.test(uncommented), 'SQL pack contains a regex operator or known unsupported regex construct');
assert(!uncommented.includes('FROM cron.job'), 'optional Q13 must remain commented');

const changed = new Set();
for (const args of [['diff','--name-only'], ['diff','--cached','--name-only']]) {
  const output = execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  for (const file of output.split('\n').filter(Boolean)) changed.add(file);
}
for (const file of changed) assert(allowedChanges.has(file), `unexpected tracked/staged change outside DB1C-1A scope: ${file}`);
for (const protectedPath of ['products.json','supabase/migrations','functions','assets','tests']) {
  const dirty = [...changed].some(file => file === protectedPath || file.startsWith(`${protectedPath}/`));
  assert(!dirty, `protected path changed: ${protectedPath}`);
}

const staged = execFileSync('git', ['diff','--cached','--name-only'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
for (const file of staged) assert(!file.startsWith('.codex/') && !file.startsWith('.wrangler/'), `local folder staged unexpectedly: ${file}`);

const summary = {
  requiredDeliverables: deliverables.length,
  repositorySecurityDefinerNames: repositoryDefiners.size,
  liveSecurityDefinerNamesDocumented: grantNames.size,
  publicExecuteCountDocumented: publicExposureCount,
  anonExecuteCountDocumented: anonExposureCount,
  authenticatedExecuteCountDocumented: authenticatedExposureCount,
  serviceRoleExecuteCountDocumented: serviceRoleExposureCount,
  serviceRoleRestrictedCountDocumented: restrictedCount,
  directRpcNames: directRpcNames.size,
  confirmedNormalTriggers: confirmedTriggers.length,
  eventTriggerRowsDocumented: 0,
  executableReadOnlySqlStatements: statements.length,
  status: failures.length ? 'FAIL' : 'PASS'
};
console.log(JSON.stringify(summary, null, 2));
if (failures.length) {
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
