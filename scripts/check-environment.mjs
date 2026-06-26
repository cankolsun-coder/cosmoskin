#!/usr/bin/env node
const groups = {
  required: ['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','ADMIN_TOKEN','ADMIN_SESSION_SECRET','IYZICO_API_KEY','IYZICO_SECRET_KEY','PUBLIC_SITE_URL'],
  operations: ['CRON_SECRET','EFT_RESERVATION_MINUTES','ADMIN_SESSION_TTL_SECONDS'],
  optional: ['BREVO_API_KEY','REQUIRE_CLOUDFLARE_ACCESS','ADMIN_ALLOW_LEGACY_TOKEN']
};
let failed = false;
for (const [group,names] of Object.entries(groups)) {
  console.log(`\n${group.toUpperCase()}`);
  for (const name of names) {
    const present = Boolean(process.env[name]);
    console.log(`${present ? 'OK ' : '---'} ${name}`);
    if (group === 'required' && !present) failed = true;
  }
}
if (process.env.ADMIN_ALLOW_LEGACY_TOKEN !== 'false') console.warn('\nWARNING: Set ADMIN_ALLOW_LEGACY_TOKEN=false after confirming signed admin sessions.');
if (process.env.REQUIRE_CLOUDFLARE_ACCESS !== 'true') console.warn('WARNING: Cloudflare Access is not required by configuration.');
process.exitCode = failed ? 1 : 0;
