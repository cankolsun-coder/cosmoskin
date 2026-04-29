
(function(){
  const originalFetch = window.fetch.bind(window);
  async function getAccessToken(){
    try {
      if (window.cosmoskinSupabase?.auth?.getSession) {
        const { data } = await window.cosmoskinSupabase.auth.getSession();
        if (data?.session?.access_token) return data.session.access_token;
      }
      if (window.supabase?.createClient && window.COSMOSKIN_CONFIG?.supabaseUrl && window.COSMOSKIN_CONFIG?.supabaseAnonKey) {
        window.cosmoskinSupabase = window.cosmoskinSupabase || window.supabase.createClient(window.COSMOSKIN_CONFIG.supabaseUrl, window.COSMOSKIN_CONFIG.supabaseAnonKey, { auth:{ persistSession:true, autoRefreshToken:true, detectSessionInUrl:true }});
        const { data } = await window.cosmoskinSupabase.auth.getSession();
        if (data?.session?.access_token) return data.session.access_token;
      }
      for (let i=0;i<localStorage.length;i++){
        const key=localStorage.key(i);
        if (!key || !key.startsWith('sb-') || !key.endsWith('-auth-token')) continue;
        const val=JSON.parse(localStorage.getItem(key)||'{}');
        const token=val?.access_token || val?.currentSession?.access_token || val?.session?.access_token;
        if (token) return token;
      }
    } catch(e){ console.warn('COSMOSKIN account token lookup failed', e); }
    return '';
  }
  window.cosmoskinAccountFetch = async function(url, options={}){
    const opts={...options};
    opts.headers=new Headers(options.headers || {});
    opts.credentials=opts.credentials || 'include';
    if (String(url).startsWith('/api/')) {
      const token=await getAccessToken();
      if (token && !opts.headers.has('Authorization')) opts.headers.set('Authorization', 'Bearer '+token);
      if (!opts.headers.has('Accept')) opts.headers.set('Accept','application/json');
    }
    return originalFetch(url, opts);
  };
  window.fetch = async function(url, options={}){
    if (typeof url === 'string' && url.startsWith('/api/')) return window.cosmoskinAccountFetch(url, options);
    return originalFetch(url, options);
  };
})();
