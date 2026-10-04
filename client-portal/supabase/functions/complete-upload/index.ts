import { corsHeaders, json, requireStaff, sha256Hex } from "../_shared/portal.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const AREAS = new Set(["gst", "tds", "income_tax", "accounts", "mca", "other"]);

function normalizedArea(value: string) {
  const area = value.trim().toLowerCase().replace(/-/g, "_");
  return AREAS.has(area) ? area : "other";
}

function periodIsValid(mode: string, period: string | null) {
  if (mode === "none") return !period;
  if (!period) return false;
  if (mode === "month") return /^(0[1-9]|1[0-2])$/.test(period);
  if (mode === "quarter") return /^Q[1-4]$/.test(period);
  return mode === "custom" && period.length <= 80;
}

async function filingContext(service: any, id: string) {
  const chain: any[] = [];
  let nextId: string | null = id;
  while (nextId && chain.length < 20) {
    const { data: node, error } = await service.from("filing_nodes")
      .select("id,parent_id,slug,node_type,enabled,requires_financial_year,period_mode")
      .eq("id", nextId).maybeSingle();
    if (error) throw error;
    if (!node || !node.enabled) return null;
    chain.unshift(node);
    nextId = node.parent_id;
  }
  const root = chain[0];
  const selected = chain.at(-1);
  if (!root || root.node_type !== "subject" || selected?.id !== id || nextId) return null;
  return { root, selected, area: normalizedArea(root.slug) };
}

async function registryExists(service: any, documentId: string) {
  const { data, error } = await service.from("onedrive_file_registry").select("id").eq("document_id", documentId).limit(1).maybeSingle();
  if (error) throw error;
  return !!data;
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { user, service } = await requireStaff(req);
    const body = await req.json();
    const uploadId = String(body.uploadId ?? "").trim();
    if (!uploadId) return json({ error: "uploadId is required." }, 400);

    const { data: upload, error: uploadError } = await service.from("document_uploads")
      .select("*").eq("id", uploadId).eq("requested_by", user.id).maybeSingle();
    if (uploadError) throw uploadError;
    if (!upload) return json({ error: "Upload request not found." }, 404);

    const { data: existing, error: existingError } = await service.from("documents")
      .select("id,status,client_id,original_filename,area,financial_year,filing_period,classification_confidence,filing_node_id")
      .eq("upload_id", upload.id).maybeSingle();
    if (existingError) throw existingError;
    if (existing) {
      if (!upload.completed_at) await service.from("document_uploads").update({ completed_at: new Date().toISOString() }).eq("id", upload.id);
      return json({
        state: existing.status,
        documentId: existing.id,
        classification: { clientId: existing.client_id, area: existing.area, financialYear: existing.financial_year, period: existing.filing_period, confidence: existing.classification_confidence, filingNodeId: existing.filing_node_id },
        oneDrive: null,
        oneDriveRegistryLinked: await registryExists(service, existing.id),
        requiresReview: existing.status === "review",
        alreadyFinalized: true,
      });
    }
    if (upload.completed_at) return json({ error: "Upload was already completed but its document record could not be found." }, 409);
    if (new Date(upload.expires_at) < new Date()) return json({ error: "Upload URL expired; request a new one." }, 410);

    if (upload.proposed_client_id && upload.sha256) {
      const { data: duplicate, error } = await service.from("documents")
        .select("id,status,client_id,original_filename,area,financial_year,filing_period,classification_confidence,filing_node_id")
        .eq("client_id", upload.proposed_client_id).eq("sha256", upload.sha256).is("deleted_at", null).limit(1).maybeSingle();
      if (error) throw error;
      if (duplicate) {
        await service.from("document_uploads").update({ completed_at: new Date().toISOString() }).eq("id", upload.id);
        return json({
          state: duplicate.status,
          documentId: duplicate.id,
          classification: { clientId: duplicate.client_id, area: duplicate.area, financialYear: duplicate.financial_year, period: duplicate.filing_period, confidence: duplicate.classification_confidence, filingNodeId: duplicate.filing_node_id },
          oneDrive: null,
          oneDriveRegistryLinked: await registryExists(service, duplicate.id),
          requiresReview: duplicate.status === "review",
          duplicate: true,
          alreadyFinalized: true,
        });
      }
    }

    const { data: object, error: downloadError } = await service.storage.from("client-documents").download(upload.object_path);
    if (downloadError || !object) throw new Error("Uploaded object is unavailable.");
    const bytes = await object.arrayBuffer();
    if (bytes.byteLength !== upload.byte_size || await sha256Hex(bytes) !== upload.sha256) {
      throw new Error("Uploaded file checksum does not match the requested file.");
    }

    const reasons = Array.isArray(upload.reasons) ? upload.reasons : [];
    const manual = reasons.includes("Manual classification selected by KKA staff");
    const nodeId = upload.proposed_filing_node_id ? String(upload.proposed_filing_node_id) : "";
    let filing = nodeId ? await filingContext(service, nodeId) : null;
    let autoReady = false;
    if (filing && upload.proposed_client_id && !manual) {
      const area = normalizedArea(String(upload.proposed_area ?? ""));
      const year = filing.selected.requires_financial_year && typeof upload.proposed_financial_year === "string" ? upload.proposed_financial_year : null;
      const period = filing.selected.period_mode !== "none" && typeof upload.proposed_period === "string" ? upload.proposed_period : null;
      const { data: client, error } = await service.from("clients").select("id,cin").eq("id", upload.proposed_client_id).eq("active", true).maybeSingle();
      if (error) throw error;
      autoReady = upload.confidence === 100
        && area !== "other"
        && area === filing.area
        && (area !== "mca" || !!client?.cin)
        && !!client
        && (!filing.selected.requires_financial_year || /^\d{4}-\d{2}$/.test(year ?? ""))
        && periodIsValid(filing.selected.period_mode, period);
    }
    if (manual && upload.proposed_client_id && !filing) {
      return json({ error: "The selected filing folder is unavailable. Please prepare the upload again." }, 409);
    }
    const status = manual || autoReady ? "accepted" : "review";
    const clientId = upload.proposed_client_id ?? null;
    const area = upload.proposed_area ?? "other";
    const financialYear = filing?.selected.requires_financial_year ? upload.proposed_financial_year ?? null : null;
    const period = filing?.selected.period_mode !== "none" ? upload.proposed_period ?? null : null;
    const finalPath = status === "accepted" && clientId && nodeId
      ? `${clientId}/${nodeId}${financialYear ? `/${financialYear}` : ""}${period ? `/${period}` : ""}/${crypto.randomUUID()}`
      : `review/${crypto.randomUUID()}`;

    const { error: moveError } = await service.storage.from("client-documents").move(upload.object_path, finalPath);
    if (moveError) throw moveError;

    let oneDrive: any = null;
    let oneDriveRegistryError: string | null = null;
    if (status === "accepted" && clientId && nodeId) {
      const authorization = req.headers.get("Authorization");
      if (!authorization) throw new Error("Missing staff session.");
      try {
        const response = await fetch(`${SUPABASE_URL}/functions/v1/filing-storage`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: authorization },
          body: JSON.stringify({
            operation: "upload_from_supabase",
            storagePath: finalPath,
            filename: upload.original_filename,
            clientId,
            filingNodeId: nodeId,
            area,
            financialYear,
            filingPeriod: period,
          }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.success) throw new Error(result.error || `OneDrive transfer failed (HTTP ${response.status}).`);
        oneDrive = { driveItemId: result.item?.id ?? null, webUrl: result.item?.webUrl ?? null, parentDriveItemId: result.parentDriveItemId ?? null, registryId: result.registry?.id ?? null };
        oneDriveRegistryError = result.registryError ?? null;
      } catch (error) {
        const { error: rollbackError } = await service.storage.from("client-documents").move(finalPath, upload.object_path);
        if (rollbackError) console.error("Failed to restore staging file after OneDrive transfer failure", rollbackError);
        throw error;
      }
    }

    const { data: document, error: insertError } = await service.from("documents").insert({
      client_id: clientId,
      upload_id: upload.id,
      original_filename: upload.original_filename,
      storage_path: finalPath,
      content_type: upload.content_type,
      byte_size: upload.byte_size,
      sha256: upload.sha256,
      area,
      financial_year: financialYear,
      filing_period: period,
      filing_node_id: nodeId || null,
      status,
      classification_confidence: upload.confidence,
      classification_reasons: upload.reasons,
      uploaded_by: user.id,
    }).select().single();
    let finalized = document;
    if (insertError) {
      const retry = await service.from("documents").select("id,status,client_id,original_filename,area,financial_year,filing_period,classification_confidence,filing_node_id").eq("upload_id", upload.id).maybeSingle();
      if (retry.error) throw insertError;
      if (!retry.data) throw new Error(insertError.message || "Document record could not be finalized.");
      finalized = retry.data;
    }

    if (oneDrive?.registryId) {
      const { error } = await service.from("onedrive_file_registry").update({
        document_id: finalized.id,
        deleted_at: null,
        deletion_source: null,
        classification_status: "classified",
        updated_at: new Date().toISOString(),
      }).eq("id", oneDrive.registryId);
      if (error) oneDriveRegistryError = error.message || "OneDrive registry link could not be updated.";
    }
    const { error: completionError } = await service.from("document_uploads")
      .update({ completed_at: new Date().toISOString() }).eq("id", upload.id);
    if (completionError) throw completionError;

    const { error: auditError } = await service.from("audit_logs").insert({
      actor_id: user.id,
      client_id: finalized.client_id,
      action: "document_uploaded",
      entity_type: "document",
      entity_id: finalized.id,
      metadata: {
        filename: upload.original_filename,
        state: finalized.status,
        confidence: upload.confidence,
        manual,
        filingNodeId: nodeId || null,
        oneDrive,
        oneDriveRegistryLinked: !oneDriveRegistryError && !!oneDrive?.registryId,
        oneDriveRegistryError,
      },
    });
    if (auditError) console.error("Upload audit log could not be recorded", auditError);

    return json({
      state: finalized.status,
      documentId: finalized.id,
      classification: { clientId: finalized.client_id, area: finalized.area, financialYear: finalized.financial_year, period: finalized.filing_period, confidence: finalized.classification_confidence, filingNodeId: finalized.filing_node_id },
      oneDrive,
      oneDriveRegistryLinked: !oneDriveRegistryError && !!oneDrive?.registryId,
      oneDriveRegistryLinkError: oneDriveRegistryError,
      auditLogged: !auditError,
      requiresReview: finalized.status === "review",
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Upload could not be completed." }, 400);
  }
});
