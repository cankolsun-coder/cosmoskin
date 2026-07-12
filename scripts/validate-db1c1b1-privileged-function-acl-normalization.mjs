#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const migrationName = '20260712232725_db1c1b1_privileged_function_acl_normalization.sql';
const migrationPath = `supabase/migrations/${migrationName}`;
const manifestPath = 'COSMOSKIN_DB1C1B1_FUNCTION_ACL_TARGET_MANIFEST_20260712.csv';
const preflightPath = 'COSMOSKIN_DB1C1B1_ACL_PREFLIGHT_QUERIES_20260712.sql';
const postDeployPath = 'COSMOSKIN_DB1C1B1_ACL_POST_DEPLOY_VERIFICATION_QUERIES_20260712.sql';
const rollbackPath = 'COSMOSKIN_DB1C1B1_ACL_ROLLBACK_REVIEW_ONLY_20260712.sql';
const validatorPath = 'scripts/validate-db1c1b1-privileged-function-acl-normalization.mjs';
const requiredFiles = [
  migrationPath,
  'COSMOSKIN_DB1C1B1_PRIVILEGED_FUNCTION_ACL_NORMALIZATION_REPORT_20260712.md',
  manifestPath,
  preflightPath,
  postDeployPath,
  'COSMOSKIN_DB1C1B1_ACL_ROLLBACK_PLAN_20260712.md',
  rollbackPath,
  'COSMOSKIN_DB1C1B1_CHANGED_FILES_20260712.txt',
  'COSMOSKIN_DB1C1B1_RUNBOOK_20260712.md',
  'COSMOSKIN_DB1C1B1_STOP_CONDITIONS_20260712.md',
  validatorPath
];
const allowedChanges = new Set(requiredFiles);
const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

for (const file of requiredFiles) assert(fs.existsSync(path.join(root, file)), `missing required file: ${file}`);

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { value += '"'; index += 1; }
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

function stripSqlComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*--.*$/gm, '');
}

function validateSelectOnly(relativePath) {
  const sql = stripSqlComments(read(relativePath));
  const statements = sql.split(';').map(statement => statement.trim()).filter(Boolean);
  assert(statements.length > 0, `${relativePath} has no executable queries`);
  for (const [index, statement] of statements.entries()) {
    assert(/^(select|with)\b/i.test(statement), `${relativePath} statement ${index + 1} is not SELECT/WITH SELECT`);
  }
  const withoutStrings = sql.replace(/'(?:''|[^'])*'/g, "''");
  assert(!/\b(insert|update|delete|alter|create|drop|grant|revoke|truncate|merge|call|do|copy)\b/i.test(withoutStrings), `${relativePath} contains an executable mutation keyword`);
  return statements.length;
}

function walk(dir, extensions) {
  const files = [];
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, {withFileTypes:true})) {
    if (['.git','.codex','.wrangler','node_modules'].includes(entry.name)) continue;
    const full = path.join(dir,entry.name);
    if (entry.isDirectory()) files.push(...walk(full,extensions));
    else if (extensions.some(extension=>entry.name.endsWith(extension))) files.push(full);
  }
  return files;
}

const manifestRows = parseCsv(read(manifestPath));
const header = manifestRows[0] || [];
const data = manifestRows.slice(1);
const column = name => header.indexOf(name);
for (const required of [
  'exact_signature','function_name','current_public_execute','current_anon_execute','current_authenticated_execute',
  'current_service_role_execute','call_path_class','confirmed_backend_rpc','confirmed_trigger_target','proposed_public_execute',
  'proposed_anon_execute','proposed_authenticated_execute','proposed_service_role_execute','migration_action',
  'rollback_public','rollback_anon','rollback_authenticated','rollback_service_role','evidence_source','risk_level','notes'
]) assert(column(required) >= 0, `manifest missing column: ${required}`);

assert(data.length === 33, `manifest must contain 33 live privileged identities; found ${data.length}`);
const bySignature = new Map(data.map(row => [row[column('exact_signature')], row]));
assert(bySignature.size === 33, `manifest signatures must be unique; found ${bySignature.size}`);
for (const signature of bySignature.keys()) assert(/^public\.[a-z_][a-z0-9_]*\([^<>]*\)$/i.test(signature), `manifest signature is not exact: ${signature}`);

const actionableRows = data.filter(row => row[column('migration_action')] !== 'no_change_verified');
const noChangeRows = data.filter(row => row[column('migration_action')] === 'no_change_verified');
assert(actionableRows.length === 21, `manifest must contain 21 actionable rows; found ${actionableRows.length}`);
assert(noChangeRows.length === 12, `manifest must contain 12 no-change rows; found ${noChangeRows.length}`);
for (const row of data) {
  assert(row[column('proposed_public_execute')] === 'no', `proposed PUBLIC must be no: ${row[column('exact_signature')]}`);
  assert(row[column('proposed_anon_execute')] === 'no', `proposed anon must be no: ${row[column('exact_signature')]}`);
  assert(row[column('proposed_authenticated_execute')] === 'no', `proposed authenticated must be no: ${row[column('exact_signature')]}`);
  assert(row[column('proposed_service_role_execute')] === 'yes', `service_role decision must be explicit yes: ${row[column('exact_signature')]}`);
}

const migrationFiles = fs.readdirSync(path.join(root, 'supabase/migrations')).filter(name => /^\d{14}_.*\.sql$/.test(name));
const matchingVersion = migrationFiles.filter(name => name.startsWith('20260712232725_'));
assert(/^\d{14}_db1c1b1_privileged_function_acl_normalization\.sql$/.test(migrationName), 'migration filename lacks a unique 14-digit UTC version');
assert(matchingVersion.length === 1 && matchingVersion[0] === migrationName, `migration version collision or mismatch: ${matchingVersion.join(', ')}`);

const migration = read(migrationPath);
const migrationWithoutComments = stripSqlComments(migration);
assert(/^\s*BEGIN\s*;/i.test(migrationWithoutComments), 'migration must begin with BEGIN');
assert(/COMMIT\s*;\s*$/i.test(migrationWithoutComments), 'migration must end with COMMIT');
assert(/DO\s+\$db1c1b1_preflight\$/i.test(migrationWithoutComments), 'migration lacks the fail-safe preflight DO block');

const aclLines = migration.split('\n').map(line => line.trim()).filter(line => /^(REVOKE|GRANT)\s+EXECUTE\s+ON\s+FUNCTION\b/i.test(line));
assert(aclLines.length === 22, `migration must contain 22 ACL statements; found ${aclLines.length}`);
const aclRecords = [];
for (const line of aclLines) {
  const match = line.match(/^(REVOKE|GRANT)\s+EXECUTE\s+ON\s+FUNCTION\s+(public\.[a-z_][a-z0-9_]*\([^;]*\))\s+(FROM|TO)\s+([^;]+);$/i);
  assert(Boolean(match), `ACL statement is not exact-signature form: ${line}`);
  if (!match) continue;
  const [,verb,signature,direction,roles] = match;
  assert(bySignature.has(signature), `ACL signature absent from manifest: ${signature}`);
  assert(!signature.includes('citext'), `migration targets an extension overload: ${signature}`);
  aclRecords.push({verb:verb.toUpperCase(),signature,direction:direction.toUpperCase(),roles:roles.split(',').map(role=>role.trim())});
}

const revokes = aclRecords.filter(record => record.verb === 'REVOKE');
const grants = aclRecords.filter(record => record.verb === 'GRANT');
assert(revokes.length === 21, `expected 21 exact revoke statements; found ${revokes.length}`);
assert(grants.length === 1, `expected one service-role grant; found ${grants.length}`);
assert(new Set(revokes.map(record => record.signature)).size === 21, 'revoke signatures must be unique');
for (const row of actionableRows) assert(revokes.some(record => record.signature === row[column('exact_signature')]), `actionable manifest row lacks revoke: ${row[column('exact_signature')]}`);
for (const row of noChangeRows) assert(!aclRecords.some(record => record.signature === row[column('exact_signature')]), `no-change function has a migration ACL statement: ${row[column('exact_signature')]}`);

for (const grant of grants) {
  assert(grant.direction === 'TO' && grant.roles.length === 1 && grant.roles[0] === 'service_role', `unauthorized grant roles: ${grant.roles.join(', ')}`);
  const row = bySignature.get(grant.signature);
  assert(row?.[column('confirmed_backend_rpc')] === 'yes', `service_role grant is not manifest-approved backend RPC: ${grant.signature}`);
}
assert(grants[0]?.signature === 'public.recalculate_customer_membership(uuid)', 'explicit service-role grant must target recalculate_customer_membership(uuid)');
assert(!/GRANT\s+EXECUTE[\s\S]*\bTO\s+(PUBLIC|anon|authenticated)\b/i.test(migrationWithoutComments), 'migration grants EXECUTE to a disallowed role');

const cleanupLine = revokes.find(record => record.signature === 'public.cleanup_old_notifications(integer, integer, integer, integer)');
assert(cleanupLine?.roles.includes('anon') && cleanupLine?.roles.includes('authenticated'), 'cleanup_old_notifications lacks explicit anon/authenticated revoke');
assert(!cleanupLine?.roles.includes('PUBLIC'), 'cleanup_old_notifications should not contain a noisy PUBLIC revoke because PUBLIC was already closed');
const publicRevokeCount = revokes.filter(record => record.roles.includes('PUBLIC')).length;
const anonRevokeCount = revokes.filter(record => record.roles.includes('anon')).length;
const authenticatedRevokeCount = revokes.filter(record => record.roles.includes('authenticated')).length;
assert(publicRevokeCount === 20, `expected 20 PUBLIC revokes; found ${publicRevokeCount}`);
assert(anonRevokeCount === 21, `expected 21 anon revokes; found ${anonRevokeCount}`);
assert(authenticatedRevokeCount === 21, `expected 21 authenticated revokes; found ${authenticatedRevokeCount}`);

const migrationNoStrings = migrationWithoutComments.replace(/'(?:''|[^'])*'/g, "''");
for (const prohibited of [
  /CREATE\s+OR\s+REPLACE\s+FUNCTION/i,/ALTER\s+FUNCTION/i,/DROP\s+FUNCTION/i,/CREATE\s+TRIGGER/i,
  /DROP\s+TRIGGER/i,/CREATE\s+POLICY/i,/DROP\s+POLICY/i,/ALTER\s+TABLE/i,/schema_migrations/i,
  /migration\s+repair/i,/search_path/i,/OWNER\s+TO/i,/SECURITY\s+(DEFINER|INVOKER)/i
]) assert(!prohibited.test(migrationNoStrings), `migration contains prohibited non-ACL operation: ${prohibited}`);

for (const row of actionableRows) {
  const compact = row[column('exact_signature')].replaceAll(' ', '');
  assert(migration.includes(`to_regprocedure('${compact}')`), `migration preflight does not enumerate exact target: ${compact}`);
}

const highRiskNames = [
  'reserve_product_inventory','cleanup_old_notifications','recalculate_customer_membership','recalculate_loyalty_account',
  'recalculate_routine_streak','create_account_activity','refresh_inventory_estimate','check_purchase','get_review_summary'
];
for (const name of highRiskNames) assert(data.some(row => row[column('function_name')] === name), `high-risk function absent from manifest: ${name}`);

const triggerNames = [
  'cosmoskin_activity_order_insert','cosmoskin_activity_order_update','cosmoskin_activity_routine_complete',
  'handle_new_auth_user_profile','handle_new_user_profile','loyalty_ledger_recalculate_trigger',
  'routine_completion_recalculate_trigger','sync_review_helpful_count'
];
for (const name of triggerNames) {
  const row = data.find(item => item[column('function_name')] === name);
  assert(row?.[column('confirmed_trigger_target')] === 'yes', `confirmed trigger not marked in manifest: ${name}`);
  assert(migration.includes(row?.[column('exact_signature')] ?? '<missing>'), `confirmed trigger exact signature absent from migration: ${name}`);
}

const baselineMd5s = [
  'fb017bb59ffbe770f871d60cb2c5ca72','062eb548fb11757a67911ef50aafd05d','30d155e0f57d3d73fe996e0f4faada73',
  'd8858107c597e12bf23b06896bb0ef63','3dc774d7b50d09bc129f3ea46e4e49dd','b8458c14c4328b493e6f28d863eef12e'
];
const baselineTriggerFunctions = [
  'cosmoskin_activity_order_insert','cosmoskin_activity_order_update','cosmoskin_activity_routine_complete',
  'loyalty_ledger_recalculate_trigger','routine_completion_recalculate_trigger','sync_review_helpful_count'
];
const baselineTriggerNames = [
  'cosmoskin_orders_activity_insert','cosmoskin_orders_activity_update','cosmoskin_routine_completions_activity_insert',
  'recalculate_loyalty_after_ledger_change','recalculate_streak_after_routine_completion_change',
  'sync_review_helpful_count_insert','sync_review_helpful_count_delete'
];
const deferredTriggerNames = [
  'on_auth_user_created_profile','on_auth_user_created_cosmoskin_profile'
];
const deferredTriggerFunctions = [
  'handle_new_auth_user_profile','handle_new_user_profile'
];
const knownTriggerAttachmentNames = [...baselineTriggerNames, ...deferredTriggerNames];
assert(triggerNames.length === 8, `expected eight confirmed trigger functions; found ${triggerNames.length}`);
assert(knownTriggerAttachmentNames.length === 9, `expected nine known trigger attachments; found ${knownTriggerAttachmentNames.length}`);
assert(baselineTriggerFunctions.length === 6, `expected six exact-baselined trigger functions; found ${baselineTriggerFunctions.length}`);
assert(baselineTriggerNames.length === 7, `expected seven exact-baselined trigger attachments; found ${baselineTriggerNames.length}`);
for (const value of [...baselineMd5s,...baselineTriggerNames]) {
  assert(migration.includes(value), `migration preflight missing supplied baseline: ${value}`);
  assert(read(preflightPath).includes(value), `preflight pack missing supplied baseline: ${value}`);
  assert(read(postDeployPath).includes(value), `post-deploy pack missing supplied baseline: ${value}`);
}
for (const value of deferredTriggerNames) {
  assert(read('COSMOSKIN_DB1C1B1_PRIVILEGED_FUNCTION_ACL_NORMALIZATION_REPORT_20260712.md').includes(value), `report missing deferred trigger attachment: ${value}`);
}
for (const name of deferredTriggerFunctions) {
  const signature = data.find(row => row[column('function_name')] === name)?.[column('exact_signature')];
  assert(Boolean(signature), `deferred trigger function missing manifest identity: ${name}`);
  assert(migration.includes(signature), `deferred trigger function missing migration target: ${name}`);
  assert(read(preflightPath).includes(signature.replaceAll(' ', '')), `deferred trigger function missing preflight inventory: ${name}`);
  assert(read(postDeployPath).includes(signature.replaceAll(' ', '')), `deferred trigger function missing post-deploy inventory: ${name}`);
  assert(!baselineTriggerFunctions.includes(name), `deferred trigger function unexpectedly treated as an exact live baseline: ${name}`);
}
const report = read('COSMOSKIN_DB1C1B1_PRIVILEGED_FUNCTION_ACL_NORMALIZATION_REPORT_20260712.md');
for (const metric of [
  'trigger_function_count = 8',
  'trigger_attachment_count = 9',
  'trigger_functions_with_exact_live_baseline = 6',
  'trigger_attachments_with_exact_live_baseline = 7'
]) assert(report.includes(metric), `report missing reconciled trigger metric: ${metric}`);
assert(report.includes('exact owner/MD5/enabled-state baseline is deferred'), 'report does not state auth-profile exact trigger baselines are deferred');

const directRpcNames = new Set();
let browserStyleRpcCount = 0;
for (const scope of ['functions','assets','tests','scripts']) {
  for (const file of walk(path.join(root,scope),['.js','.mjs','.ts'])) {
    if (file.endsWith(path.basename(import.meta.filename))) continue;
    const source = fs.readFileSync(file,'utf8');
    for (const match of source.matchAll(/\brpc\s*\(\s*[^,]+,\s*['"]([a-zA-Z0-9_]+)['"]/g)) directRpcNames.add(match[1]);
    for (const match of source.matchAll(/\/rpc\/([a-zA-Z0-9_]+)/g)) directRpcNames.add(match[1]);
    if (scope === 'assets') browserStyleRpcCount += [...source.matchAll(/\.rpc\s*\(/g)].length;
  }
}
assert(directRpcNames.size === 12, `expected 12 direct runtime/test RPC names; found ${directRpcNames.size}`);
assert(browserStyleRpcCount === 0, `browser assets contain ${browserStyleRpcCount} direct .rpc calls`);
const rpcHelper = read('functions/api/_lib/supabase.js');
assert(rpcHelper.includes('SUPABASE_SERVICE_ROLE_KEY'), 'backend RPC helper does not evidence service-role credentials');
for (const name of directRpcNames) assert(data.some(row=>row[column('function_name')]===name && row[column('confirmed_backend_rpc')]==='yes'), `direct RPC not approved as backend in manifest: ${name}`);

const preflightStatements = validateSelectOnly(preflightPath);
const postDeployStatements = validateSelectOnly(postDeployPath);

const rollback = read(rollbackPath);
assert(rollback.includes('REVIEW ONLY — MANUAL AUTHORIZATION REQUIRED'), 'rollback lacks mandatory review-only warning');
const rollbackAclLines = rollback.split('\n').map(line=>line.trim()).filter(line=>/^GRANT\s+EXECUTE\s+ON\s+FUNCTION/i.test(line));
assert(rollbackAclLines.length === 21, `rollback must contain 21 exact restoration statements; found ${rollbackAclLines.length}`);
const rollbackRecords = rollbackAclLines.map(line => {
  const match = line.match(/^GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+(public\.[a-z_][a-z0-9_]*\([^;]*\))\s+TO\s+([^;]+);$/i);
  assert(Boolean(match), `rollback statement is not exact-signature form: ${line}`);
  return match ? {signature:match[1],roles:match[2].split(',').map(role=>role.trim())} : null;
}).filter(Boolean);
for (const row of actionableRows) {
  const signature = row[column('exact_signature')];
  const record = rollbackRecords.find(item => item.signature === signature);
  assert(Boolean(record), `rollback missing actionable signature: ${signature}`);
  if (!record) continue;
  if (row[column('rollback_public')] === 'yes') assert(record.roles.length === 1 && record.roles[0] === 'PUBLIC', `rollback PUBLIC mapping mismatch: ${signature}`);
  if (row[column('rollback_anon')] === 'yes_direct') assert(record.roles.includes('anon'), `rollback anon mapping mismatch: ${signature}`);
  if (row[column('rollback_authenticated')] === 'yes_direct') assert(record.roles.includes('authenticated'), `rollback authenticated mapping mismatch: ${signature}`);
}
for (const row of noChangeRows) assert(!rollbackRecords.some(record=>record.signature===row[column('exact_signature')]), `rollback contains no-change signature: ${row[column('exact_signature')]}`);

const status = execFileSync('git', ['status','--porcelain'], {cwd:root,encoding:'utf8'}).split('\n').filter(Boolean);
for (const entry of status) {
  const file = entry.slice(3).replace(/^"|"$/g, '');
  if (file.startsWith('.codex/') || file.startsWith('.wrangler/')) continue;
  assert(allowedChanges.has(file), `unexpected working-tree change outside DB1C-1B1 scope: ${file}`);
}
for (const args of [['diff','--name-only'],['diff','--cached','--name-only']]) {
  const files = execFileSync('git', args, {cwd:root,encoding:'utf8'}).split('\n').filter(Boolean);
  for (const file of files) assert(allowedChanges.has(file), `unexpected tracked/staged change: ${file}`);
}
for (const protectedPath of ['products.json','functions','assets','tests']) {
  const output = execFileSync('git', ['diff','--name-only','--',protectedPath], {cwd:root,encoding:'utf8'}).trim();
  assert(output === '', `protected application path changed: ${protectedPath}`);
}

const summary = {
  migration: migrationName,
  manifestRows: data.length,
  actionableTargets: actionableRows.length,
  noChangeVerified: noChangeRows.length,
  aclStatements: aclRecords.length,
  publicRevokes: publicRevokeCount,
  anonRevokes: anonRevokeCount,
  authenticatedRevokes: authenticatedRevokeCount,
  serviceRoleGrants: grants.length,
  triggerFunctionCount: triggerNames.length,
  triggerAttachmentCount: knownTriggerAttachmentNames.length,
  triggerFunctionsWithExactLiveBaseline: baselineTriggerFunctions.length,
  triggerAttachmentsWithExactLiveBaseline: baselineTriggerNames.length,
  triggerFunctionsDeferredExactBaseline: deferredTriggerFunctions.length,
  preflightSelectStatements: preflightStatements,
  postDeploySelectStatements: postDeployStatements,
  rollbackStatements: rollbackRecords.length,
  directRpcNames: directRpcNames.size,
  browserClientRpcCalls: browserStyleRpcCount,
  status: failures.length ? 'FAIL' : 'PASS'
};
console.log(JSON.stringify(summary,null,2));
if (failures.length) {
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
