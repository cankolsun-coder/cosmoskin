export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  // ── ADMIN ENDPOINT ─────────────────────────────
  if (path.includes("/admin")) {
    const token = request.headers.get("x-admin-token");

    if (!token || token !== env.ADMIN_TOKEN) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401 }
      );
    }

    try {
      const supabaseUrl = env.SUPABASE_URL;
      const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;

      const status = url.searchParams.get("status") || "pending";

      const res = await fetch(
        `${supabaseUrl}/rest/v1/product_reviews?status=eq.${status}&order=created_at.desc`,
        {
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
          },
        }
      );

      const data = await res.json();

      // 🔥 BURASI DÜZELTİLDİ (ADMIN PANEL İÇİN FORMAT)
      return new Response(
        JSON.stringify({
          reviews: Array.isArray(data) ? data : [],
          items: Array.isArray(data) ? data : [],
          total: Array.isArray(data) ? data.length : 0
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "access-control-allow-origin": "*"
          }
        }
      );

    } catch (err) {
      return new Response(
        JSON.stringify({ error: err.message }),
        { status: 500 }
      );
    }
  }

  // ── DEFAULT ENDPOINT ───────────────────────────
  return new Response(
    JSON.stringify({
      ok: true,
      message: "Reviews API çalışıyor"
    }),
    {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8"
      }
    }
  );
}