import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("PORTAL_ALLOWED_ORIGIN") ?? "https://portal.ca-kka.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const hash = async (buffer: ArrayBuffer) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", buffer))].map(value => value.toString(16).padStart(2, "0")).join("");

async function authenticate(req: Request) {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Missing client session");
  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const auth = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: { user }, error } = await auth.auth.getUser(token);
  if (error || !user) throw new Error("Invalid or expired client session");

  const service = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: membership, error: membershipError } = await service.from("client_memberships").select("client_id,can_upload").eq("user_id", user.id).maybeSingle();
  if (membershipError) throw membershipError;
  if (!membership) throw new Error("Client membership not found");
  if (!membership.can_upload) throw new Error("Client document upload is disabled");

  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return { user, service, caller };
}

function destination(clientId: string, area: string, financialYear: string | null, period: string | null) {
  const base = clientId;
  if (area === "gst" && financialYear && period) return `${base}/gst/${financialYear}/${period}/${crypto.randomUUID()}`;
  if (area === "tds" && financialYear && period) return `${base}/tds/${financialYear}/${period}/${crypto.randomUUID()}`;
  if ((area === "income_tax" || area === "accounts") && financialYear) return `${base}/${area}/${financialYear}/${crypto.randomUUID()}`;
  return `${base}/review/${crypto.randomUUID()}`;
}

function autoClassifiable(area: string, financialYear: string | null, period: string | null) {
  if (!financialYear || area === "other") return false;
  if (area === "gst") return /^\d{2}$/.test(period ?? "") && Number(period) >= 1 && Number(period) <= 12;
  if (area === "tds") return /^Q[1-4]$/.test(period ?? "");
  return area === "income_tax" || area === "accounts" || area === "mca";
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { user, service, caller } = await authenticate(req);
    const { uploadId } = await req.json();
    if (!uploadId) return json({ error: "uploadId is required" }, 400);

    const { data: upload, error: uploadError } = await service.from("document_uploads").select("*").eq("id", uploadId).eq("requested_by", user.id).is("completed_at", null).maybeSingle();
    if (uploadError) throw uploadError;
    if (!upload) return json({ error: "Upload request not found" }, 404);
    if (new Date(upload.expires_at) < new Date()) return json({ error: "Upload URL expired; request a new one" }, 410);
    if (!upload.proposed_client_id) return json({ error: "Upload has no selected client profile" }, 400);

    // Recheck family-profile access using the caller's RLS context at completion.
    const { data: client, error: clientError } = await caller.from("clients").select("id").eq("id", upload.proposed_client_id).eq("active", true).maybeSingle();
    if (clientError) throw clientError;
    if (!client) return json({ error: "Selected profile is no longer accessible or active" }, 403);

    const { data: duplicate, error: duplicateError } = await service.from("documents").select("id,status,client_id,original_filename,area,financial_year,filing_period").eq("client_id", upload.proposed_client_id).eq("sha256", upload.sha256).is("deleted_at", null).limit(1).maybeSingle();
    if (duplicateError) throw duplicateError;
    if (duplicate) {
      await service.storage.from("client-documents").remove([upload.object_path]);
      await service.from("document_uploads").update({ completed_at: new Date().toISOString() }).eq("id", upload.id);
      return json({ state: "duplicate", documentId: duplicate.id, existingDocumentId: duplicate.id, originalFilename: duplicate.original_filename, alreadyFinalized: true });
    }

    const { data: object, error: downloadError } = await service.storage.from("client-documents").download(upload.object_path);
    if (downloadError || !object) throw new Error("Uploaded object is unavailable");
    const bytes = await object.arrayBuffer();
    if (bytes.byteLength !== upload.byte_size || await hash(bytes) !== upload.sha256) throw new Error("Uploaded file checksum does not match the requested file");

    const area = String(upload.proposed_area || "other");
    const financialYear = upload.proposed_financial_year ? String(upload.proposed_financial_year) : null;
    const period = upload.proposed_period ? String(upload.proposed_period) : null;
    const finalPath = destination(upload.proposed_client_id, area, financialYear, period);
    const { error: moveError } = await service.storage.from("client-documents").move(upload.object_path, finalPath);
    if (moveError) throw moveError;

    const { data: document, error: insertError } = await service.from("documents").insert({
      client_id: upload.proposed_client_id,
      upload_id: upload.id,
      original_filename: upload.original_filename,
      storage_path: finalPath,
      content_type: upload.content_type,
      byte_size: upload.byte_size,
      sha256: upload.sha256,
      area,
      financial_year: financialYear,
      filing_period: period,
      status: "review",
      classification_confidence: upload.confidence,
      classification_reasons: upload.reasons,
      uploaded_by: user.id,
    }).select().single();
    if (insertError) {
      await service.storage.from("client-documents").remove([finalPath]);
      // The preflight duplicate check cannot prevent two identical uploads
      // from racing. The unique index is the final guard; return the normal
      // duplicate result when that guard wins instead of showing a generic
      // upload failure.
      if (insertError.code === "23505") {
        const { data: racedDuplicate, error: racedDuplicateError } = await service
          .from("documents")
          .select("id,original_filename")
          .eq("client_id", upload.proposed_client_id)
          .eq("sha256", upload.sha256)
          .is("deleted_at", null)
          .limit(1)
          .maybeSingle();
        if (racedDuplicateError) throw racedDuplicateError;
        if (racedDuplicate) {
          await service.from("document_uploads").update({ completed_at: new Date().toISOString() }).eq("id", upload.id);
          return json({ state: "duplicate", documentId: racedDuplicate.id, existingDocumentId: racedDuplicate.id, originalFilename: racedDuplicate.original_filename, alreadyFinalized: true });
        }
      }
      throw insertError;
    }

    await service.from("document_uploads").update({ completed_at: new Date().toISOString() }).eq("id", upload.id);
    await service.from("audit_logs").insert({
      actor_id: user.id,
      client_id: document.client_id,
      action: "client_document_uploaded",
      entity_type: "document",
      entity_id: document.id,
      metadata: {
        filename: upload.original_filename,
        state: "review",
        confidence: upload.confidence,
        destination: finalPath,
        classificationAcceptedWithoutOneDrive: autoClassifiable(area, financialYear, period),
      },
    });
    return json({
      state: document.status,
      documentId: document.id,
      destination: finalPath,
      classification: { clientId: document.client_id, area: document.area, financialYear: document.financial_year, period: document.filing_period, confidence: document.classification_confidence },
      requiresReview: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Client upload could not be completed";
    const status = /disabled|membership|session|accessible|active/i.test(message) ? 403 : 400;
    return json({ error: message }, status);
  }
});
