import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED = Deno.env.get("PORTAL_ALLOWED_ORIGIN") ?? "https://portal.ca-kka.com";
const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function errorResponse(message:string, status:number) {
  return new Response(message, {
    status,
    headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function contentDisposition(filename:string) {
  const fallback = filename.replace(/[\r\n"]/g, "_").slice(0, 180) || "document";
  const encoded = encodeURIComponent(filename).replace(/['()]/g, escape);
  return `inline; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

Deno.serve(async (req:Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return errorResponse("GET requests only.", 405);

  try {
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return errorResponse("Authentication required.", 401);

    const url = new URL(req.url);
    const match = url.pathname.match(/\/documents\/([^/]+)\/view\/?$/);
    const documentId = decodeURIComponent(match?.[1] ?? url.searchParams.get("documentId") ?? "");
    if (!documentId) return errorResponse("Document ID is required.", 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anon = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: { user }, error: authError } = await anon.auth.getUser(token);
    if (authError || !user) return errorResponse("Invalid or expired session.", 401);

    const service = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: profile, error: profileError } = await service
      .from("profiles")
      .select("role,active")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile?.active) return errorResponse("Your KKA account is inactive.", 403);

    const { data: doc, error: docError } = await service
      .from("documents")
      .select("id,client_id,storage_path,original_filename,content_type,byte_size,sha256,status,deleted_at")
      .eq("id", documentId)
      .maybeSingle();
    if (docError) throw docError;
    if (!doc) return errorResponse("Document not found.", 404);
    if (doc.status !== "accepted" || doc.deleted_at) return errorResponse("Document is no longer available.", 403);

    const isStaff = profile.role === "admin" || profile.role === "staff";
    if (!isStaff) {
      if (profile.role !== "client" || !doc.client_id) return errorResponse("Document access denied.", 403);

      const { data: membership, error: membershipError } = await service
        .from("client_memberships")
        .select("client_id")
        .eq("user_id", user.id)
        .eq("client_id", doc.client_id)
        .maybeSingle();
      if (membershipError) throw membershipError;
      if (!membership?.client_id) return errorResponse("Document access denied.", 403);
    }

    const { data: file, error: fileError } = await service.storage
      .from("client-documents")
      .download(doc.storage_path);
    if (fileError || !file) {
      console.error("document-view storage error", fileError);
      return errorResponse("The document file is unavailable.", 404);
    }

    const contentType = doc.content_type || file.type || "application/octet-stream";
    const headers = new Headers(corsHeaders);
    headers.set("Content-Type", contentType);
    headers.set("Content-Disposition", contentDisposition(doc.original_filename));
    headers.set("Content-Length", String(file.size ?? doc.byte_size ?? 0));
    headers.set("Cache-Control", "private, no-store, max-age=0");
    headers.set("X-Content-Type-Options", "nosniff");
    if (doc.sha256) headers.set("ETag", `"${doc.sha256}"`);

    return new Response(file.stream(), { status: 200, headers });
  } catch (error) {
    console.error("document-view", error);
    return errorResponse(error instanceof Error ? error.message : "Document could not be opened.", 500);
  }
});
