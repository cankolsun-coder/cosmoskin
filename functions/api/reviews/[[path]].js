export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  // Admin endpoint kontrolü
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

      return new Response(JSON.stringify(data), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      });
    } catch (err) {
      return new Response(
        JSON.stringify({ error: err.message }),
        { status: 500 }
      );
    }
  }

  // Default endpoint
  return new Response(
    JSON.stringify({ message: "Reviews API çalışıyor" }),
    {
      status: 200,
      headers: {
        "content-type": "application/json",
      },
    }
  );
}