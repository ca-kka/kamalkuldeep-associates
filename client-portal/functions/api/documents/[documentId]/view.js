const SUPABASE_URL = "https://wvyjyncgxtstyquecfdg.supabase.co";
const DOCUMENT_VIEW_FUNCTION = SUPABASE_URL + "/functions/v1/document-view";

export async function onRequestGet(context) {
  const auth = context.request.headers.get("Authorization");
  if (!auth) return new Response("Authentication required.", { status: 401 });

  const match = context.request.url.match(/\/api\/documents\/([^/]+)\/view\/?$/);
  const documentId = decodeURIComponent(match?.[1] || "");
  if (!documentId) return new Response("Document ID is required.", { status: 400 });

  const upstream = await fetch(DOCUMENT_VIEW_FUNCTION + "?documentId=" + encodeURIComponent(documentId), {
    method: "GET",
    headers: { Authorization: auth },
  });

  const headers = new Headers(upstream.headers);
  headers.delete("Access-Control-Allow-Origin");
  headers.delete("Access-Control-Allow-Headers");
  headers.delete("Access-Control-Allow-Methods");
  headers.set("Cache-Control", "private, no-store, max-age=0");

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}
