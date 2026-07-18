const jsString = (value) => JSON.stringify(String(value || ''));

export async function onRequestGet(context) {
  const env = context.env || {};
  const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL || env.COSMOSKIN_SUPABASE_URL || 'https://nhrvqpymtvilsfwttnge.supabase.co';
  const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || env.COSMOSKIN_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ocnZxcHltdHZpbHNmd3R0bmdlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxMzQ4MTcsImV4cCI6MjA5NzcxMDgxN30.g06tsqd5D2UmGg6XLj5sD5kOUF_gQU28Ki5goFi4ZWk';
  const siteUrl = env.COSMOSKIN_SITE_URL || env.SITE_URL || 'https://www.cosmoskin.com.tr';

  const body = [
    '(function(){',
    '  window.COSMOSKIN_CONFIG = Object.assign(window.COSMOSKIN_CONFIG || {}, {',
    `    siteUrl: ${jsString(siteUrl)},`,
    `    supabaseUrl: ${jsString(supabaseUrl)},`,
    `    supabaseAnonKey: ${jsString(supabaseAnonKey)}`,
    '  });',
    `  window.COSMOSKIN_PUBLIC_SUPABASE_ANON_KEY = ${jsString(supabaseAnonKey)};`,
    '  window.COSMOSKIN_RUNTIME_CONFIG_READY = true;',
    '})();',
    ''
  ].join('\n');

  return new Response(body, {
    headers: {
      'content-type': 'application/javascript; charset=utf-8',
      'cache-control': 'no-store, max-age=0'
    }
  });
}
