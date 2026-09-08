import { corsHeaders, json, requireStaff } from "../_shared/portal.ts";

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { user, service } = await requireStaff(req);
    const body = await req.json();
    const documentId = String(body.documentId ?? "");
    const clientId = body.clientId ? String(body.clientId) : null;
    const area = body.area;
    const financialYear = body.financialYear ?? null;
    const period = body.period ?? null;
    const action = body.action === "reject" ? "reject" : "accept";
    if (!documentId || (action === "accept" && (!clientId || !area))) return json({ error: "Document, client and document area are required" }, 400);
    const { data: doc, error: lookupError } = await service.from("documents").select("id, storage_path, original_filename").eq("id", documentId).eq("status", "review").maybeSingle();
    if (lookupError) throw lookupError;
    if (!doc) return json({ error: "Review item not found or already resolved" }, 404);
    let storagePath = doc.storage_path;
    if (action === "accept" && storagePath.startsWith("review/")) {
      const nextPath = `${clientId}/${crypto.randomUUID()}`;
      const { error: moveError } = await service.storage.from("client-documents").move(storagePath, nextPath);
      if (moveError) throw moveError;
      storagePath = nextPath;
    }
    const { data: updated, error: updateError } = await service.from("documents").update({ client_id:clientId, storage_path:storagePath, area:area ?? "other", financial_year:financialYear, filing_period:period, status:action === "accept" ? "accepted" : "rejected", reviewed_by:user.id, reviewed_at:new Date().toISOString() }).eq("id", documentId).select().single();
    if (updateError) throw updateError;
    await service.from("audit_logs").insert({ actor_id:user.id, client_id:updated.client_id, action:action === "accept" ? "document_reviewed" : "document_rejected", entity_type:"document", entity_id:updated.id, metadata:{ filename:updated.original_filename } });
    return json({ state:updated.status, documentId:updated.id });
  } catch (error) { return json({ error: error instanceof Error ? error.message : "Review could not be resolved" }, 400); }
});

