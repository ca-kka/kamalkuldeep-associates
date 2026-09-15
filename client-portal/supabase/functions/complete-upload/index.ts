import { corsHeaders, json, requireStaff, sha256Hex } from "../_shared/portal.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { user, service } = await requireStaff(req);
    const { uploadId } = await req.json();
    if (!uploadId) return json({ error: "uploadId is required" }, 400);

    const { data: upload, error: uploadError } = await service.from("document_uploads").select("*").eq("id", uploadId).eq("requested_by", user.id).maybeSingle();
    if (uploadError) throw uploadError;
    if (!upload) return json({ error: "Upload request not found" }, 404);

    const { data: existingDocument, error: existingError } = await service.from("documents").select("id,status,client_id,original_filename,area,financial_year,filing_period,classification_confidence").eq("upload_id", upload.id).maybeSingle();
    if (existingError) throw existingError;
    if (existingDocument) {
      if (!upload.completed_at) await service.from("document_uploads").update({ completed_at: new Date().toISOString() }).eq("id", upload.id);
      return json({ state: existingDocument.status, documentId: existingDocument.id, classification: { clientId: existingDocument.client_id, area: existingDocument.area, financialYear: existingDocument.financial_year, period: existingDocument.filing_period, confidence: existingDocument.classification_confidence }, oneDrive: null, oneDriveRegistryLinked: true, requiresReview: existingDocument.status === "review", alreadyFinalized: true });
    }

    if (upload.completed_at) return json({ error: "Upload was already completed but its document record could not be found." }, 409);
    if (new Date(upload.expires_at) < new Date()) return json({ error: "Upload URL expired; request a new one" }, 410);

    // Duplicate protection is scoped to the destination client and active
    // documents only. Soft-deleted documents must not block a new upload.
    if (upload.proposed_client_id && upload.sha256) {
      const { data: duplicate, error: duplicateError } = await service.from("documents")
        .select("id,status,client_id,original_filename,area,financial_year,filing_period,classification_confidence")
        .eq("client_id", upload.proposed_client_id)
        .eq("sha256", upload.sha256)
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle();
      if (duplicateError) throw duplicateError;
      if (duplicate) {
        await service.from("document_uploads").update({ completed_at: new Date().toISOString() }).eq("id", upload.id);
        return json({ state: duplicate.status, documentId: duplicate.id, classification: { clientId: duplicate.client_id, area: duplicate.area, financialYear: duplicate.financial_year, period: duplicate.filing_period, confidence: duplicate.classification_confidence }, oneDrive: null, oneDriveRegistryLinked: true, requiresReview: duplicate.status === "review", duplicate: true, alreadyFinalized: true });
      }
    }

    const { data: object, error: downloadError } = await service.storage.from("client-documents").download(upload.object_path);
    if (downloadError || !object) throw new Error("Uploaded object is unavailable");
    const bytes = await object.arrayBuffer();
    if (bytes.byteLength !== upload.byte_size || await sha256Hex(bytes) !== upload.sha256) throw new Error("Uploaded file checksum does not match the requested file");

    const reasons = Array.isArray(upload.reasons) ? upload.reasons : [];
    const manual = reasons.includes("Manual classification selected by KKA staff");
    const folderPeriod = upload.proposed_period ? `/${upload.proposed_period}` : "";
    const folderFy = upload.proposed_financial_year ? `/${upload.proposed_financial_year}` : "";
    const finalPath = manual ? `${upload.proposed_client_id}/${upload.proposed_area}${folderFy}${folderPeriod}/${crypto.randomUUID()}` : (upload.proposed_client_id ? `${upload.proposed_client_id}/${crypto.randomUUID()}` : `review/${crypto.randomUUID()}`);

    const { error: moveError } = await service.storage.from("client-documents").move(upload.object_path, finalPath);
    if (moveError) throw moveError;

    let oneDrive: any = null;
    if (manual && upload.proposed_client_id && upload.proposed_area) {
      const auth = req.headers.get("Authorization");
      if (!auth) throw new Error("Missing staff session");
      const r = await fetch(`${SUPABASE_URL}/functions/v1/onedrive-storage`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: auth }, body: JSON.stringify({ operation: "upload_from_supabase", storagePath: finalPath, filename: upload.original_filename, clientId: upload.proposed_client_id, area: upload.proposed_area, financialYear: upload.proposed_financial_year ?? null, filingPeriod: upload.proposed_period ?? null }) });
      const b = await r.json().catch(() => ({}));
      if (!r.ok || !b.success) throw new Error(b.error || `OneDrive transfer failed (HTTP ${r.status})`);
      oneDrive = { driveItemId: b.item?.id ?? null, webUrl: b.item?.webUrl ?? null, parentDriveItemId: b.destination?.parentDriveItemId ?? null, registryId: b.registry?.id ?? null };
    }

    const accepted = upload.proposed_client_id && upload.confidence === 100 && upload.proposed_area !== "other" && upload.proposed_financial_year;
    const status = manual || accepted ? "accepted" : "review";
    let document: any;
    const inserted = await service.from("documents").insert({ client_id: upload.proposed_client_id, upload_id: upload.id, original_filename: upload.original_filename, storage_path: finalPath, content_type: upload.content_type, byte_size: upload.byte_size, sha256: upload.sha256, area: upload.proposed_area, financial_year: upload.proposed_financial_year, filing_period: upload.proposed_period, status, classification_confidence: upload.confidence, classification_reasons: upload.reasons, uploaded_by: user.id }).select().single();
    if (inserted.error) {
      const retry = await service.from("documents").select("id,status,client_id,original_filename,area,financial_year,filing_period,classification_confidence").eq("upload_id", upload.id).maybeSingle();
      if (retry.error) throw inserted.error;
      if (!retry.data) throw new Error(inserted.error.message || "Document record could not be finalized");
      document = retry.data;
    } else document = inserted.data;

    let registryLinkError: string | null = null;
    if (oneDrive?.registryId) {
      const { error: linkError } = await service.from("onedrive_file_registry").update({ document_id: document.id, deleted_at: null, deletion_source: null, classification_status: "classified", updated_at: new Date().toISOString() }).eq("id", oneDrive.registryId);
      if (linkError) registryLinkError = linkError.message || "OneDrive registry link could not be updated";
    }

    const { error: completeError } = await service.from("document_uploads").update({ completed_at: new Date().toISOString() }).eq("id", upload.id);
    if (completeError) throw completeError;
    await service.from("audit_logs").insert({ actor_id: user.id, client_id: document.client_id, action: "document_uploaded", entity_type: "document", entity_id: document.id, metadata: { filename: upload.original_filename, state: document.status, confidence: upload.confidence, manual, oneDrive: oneDrive ?? null, oneDriveRegistryLinked: !registryLinkError, oneDriveRegistryLinkError: registryLinkError } });

    return json({ state: document.status, documentId: document.id, classification: { clientId: document.client_id, area: document.area, financialYear: document.financial_year, period: document.filing_period, confidence: document.classification_confidence }, oneDrive, oneDriveRegistryLinked: !registryLinkError, oneDriveRegistryLinkError: registryLinkError, requiresReview: document.status === "review" });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Upload could not be completed" }, 400);
  }
});
