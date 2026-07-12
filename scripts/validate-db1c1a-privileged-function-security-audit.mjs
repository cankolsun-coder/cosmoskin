#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const required = [
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

const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

for (const file of required) assert(fs.existsSync(path.join(root, file)), `missing deliverable: ${file}`);

function walk(dir, extensions) {
  const output = [];
  if (!fs.existsSync(dir)) return output;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git', '.wrangler', '.codex', 'node_modules'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) output.push(...walk(full, extensions));
    else if (extensions.some(ext => entry.name.endsWith(ext))) output.push(full);
  }
  return output;
}

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
    const block = sql.slice(start.index, end);
    if (/\bsecurity\s+definer\b/i.test(block)) repositoryDefiners.add(start[2]);
  }
}

const knownPrivileged = new Set([
  'check_purchase','convert_order_inventory','cosmoskin_award_loyalty_for_order','cosmoskin_loyalty_balance_for_user',
  'cosmoskin_order_points_basis','cosmoskin_promote_due_loyalty_points','cosmoskin_promote_loyalty_for_order',
  'cosmoskin_reverse_loyalty_for_order','get_review_summary','handle_new_auth_user_profile','handle_new_user_profile',
  'process_iyzico_payment_failure','process_iyzico_payment_success','recalculate_customer_membership',
  'release_expired_inventory_reservations','release_order_inventory','reserve_order_inventory','reserve_product_inventory',
  'recalculate_loyalty_account','recalculate_routine_streak','cosmoskin_activity_order_insert','cosmoskin_activity_order_update',
  'loyalty_ledger_recalculate_trigger','routine_completion_recalculate_trigger','cleanup_old_notifications'
]);
const callCsv = read('COSMOSKIN_DB1C1A_FUNCTION_CALL_PATH_MATRIX_20260712.csv');
const grantCsv = read('COSMOSKIN_DB1C1A_FUNCTION_GRANT_DECISION_MATRIX_20260712.csv');
const triggerCsv = read('COSMOSKIN_DB1C1A_TRIGGER_DEPENDENCY_MATRIX_20260712.csv');

assert(callCsv.split('\n')[0].includes('exact_function_signature'), 'call-path matrix lacks exact_function_signature column');
assert(grantCsv.split('\n')[0].includes('exact_function_signature'), 'grant matrix lacks exact_function_signature column');
assert(triggerCsv.split('\n')[0].includes('exact_function_signature'), 'trigger matrix lacks exact_function_signature column');
for (const name of repositoryDefiners) {
  assert(callCsv.includes(name), `repository SECURITY DEFINER missing from call-path matrix: ${name}`);
  assert(grantCsv.includes(name), `repository SECURITY DEFINER missing from grant matrix: ${name}`);
}
for (const name of knownPrivileged) {
  assert(callCsv.includes(name), `known privileged function missing from call-path matrix: ${name}`);
  assert(grantCsv.includes(name), `known privileged function missing from grant matrix: ${name}`);
}

const directRpcNames = new Set();
for (const scope of ['functions', 'assets', 'tests', 'scripts']) {
  for (const file of walk(path.join(root, scope), ['.js', '.mjs', '.ts'])) {
    if (file.endsWith(path.basename(import.meta.filename))) continue;
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(/(?:\brpc\s*\(\s*[^,]+,\s*|\.rpc\s*\(\s*)['"]([a-zA-Z0-9_]+)['"]/g)) directRpcNames.add(match[1]);
    for (const match of source.matchAll(/\/rpc\/([a-zA-Z0-9_]+)/g)) directRpcNames.add(match[1]);
  }
}
for (const name of directRpcNames) assert(callCsv.includes(name), `direct RPC missing from call-path matrix: ${name}`);

const liveSql = read('COSMOSKIN_DB1C1A_PRIVILEGED_FUNCTION_LIVE_VERIFICATION_QUERIES_20260712.sql');
const uncommented = liveSql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*--.*$/gm, '');
const statements = uncommented.split(';').map(statement => statement.trim()).filter(Boolean);
assert(statements.length >= 12, `expected at least 12 read-only statements; found ${statements.length}`);
for (const [index, statement] of statements.entries()) {
  assert(/^(select|with)\b/i.test(statement), `SQL statement ${index + 1} is not SELECT/WITH SELECT`);
}

function cleanPath(relativePath) {
  try {
    execFileSync('git', ['diff', '--quiet', '--', relativePath], { cwd: root, stdio: 'ignore' });
    execFileSync('git', ['diff', '--cached', '--quiet', '--', relativePath], { cwd: root, stdio: 'ignore' });
    return true;
  } catch { return false; }
}
assert(cleanPath('products.json'), 'products.json has a tracked or staged diff');
assert(cleanPath('supabase/migrations'), 'supabase/migrations has a tracked or staged diff');
for (const scope of ['functions', 'assets', 'tests']) assert(cleanPath(scope), `${scope} contains a tracked or staged diff`);

const summary = {
  requiredDeliverables: required.length,
  repositorySecurityDefinerNames: repositoryDefiners.size,
  knownPrivilegedNamesCovered: knownPrivileged.size,
  directRpcNames: [...directRpcNames].sort(),
  sqlStatements: statements.length,
  status: failures.length ? 'FAIL' : 'PASS'
};
console.log(JSON.stringify(summary, null, 2));
if (failures.length) {
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
