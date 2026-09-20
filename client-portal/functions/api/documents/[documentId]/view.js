const SUPABASE_URL = "https://wvyjyncgxtstyquecfdg.supabase.co";
const FUNCTION_URL = SUPABASE_URL + "/functions/v1/document-view";

export async function onRequestGet(context) {
  const auth = context.request.headers.get("Authorization");
  if (!auth) return new Response("Authentication required.", { status: 401 });

  const upstream = await fetch(FUNCTION_URL, {
    method: "GET",
    headers: { Authorization: auth },
  });

  const headers = new Headers(upstream.headers);
  headers.delete("access-control-allow-origin");
  headers.delete("access-control-allow-headers");
  headers.delete("access-control-allow-methods");
  headers.set("Cache-Control", "private, no-store, max-age=0");

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}
