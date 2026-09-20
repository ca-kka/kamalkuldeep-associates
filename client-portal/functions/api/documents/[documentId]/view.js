const SUPABASE_URL = "https://wvyjyncgxtstyquecfdg.supabase.co";
const ACCESS_FUNCTION = SUPABASE_URL + "/functions/v1/client-document-access";

export async function onRequestGet(context) {
  const auth = context.request.headers.get("Authorization");
  if (!auth) return new Response("Authentication required.", { status: 401 });

  const match = context.request.url.match(/\/api\/documents\/([^/]+)\/view\/?$/);
  const documentId = decodeURIComponent(match?.[1] || "");
  if (!documentId) return new Response("Document ID is required.", { status: 400 });

  const upstream = await fetch(ACCESS_FUNCTION, {
    method: "POST",
    headers: {
      "Authorization": auth,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ documentId, action: "view" }),
  });

  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok || !data.url) {
    return new Response(data.error || "The document could not be opened.", {
      status: upstream.status || 502,
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  }

  const file = await fetch(data.url);
  if (!file.ok || !file.body) {
    return new Response("The document file could not be retrieved.", {
      status: file.status || 502,
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  }

  const headers = new Headers();
  headers.set("Content-Type", data.contentType || file.headers.get("Content-Type") || "application/octet-stream");
  headers.set("Content-Disposition", file.headers.get("Content-Disposition") || `inline; filename="${String(data.filename || "document").replace(/[\r\n"]/g, "_")}"`);
  headers.set("Cache-Control", "private, no-store, max-age=0");
  headers.set("X-Content-Type-Options", "nosniff");
  const length = file.headers.get("Content-Length");
  if (length) headers.set("Content-Length", length);

  return new Response(file.body, { status: 200, headers });
}
