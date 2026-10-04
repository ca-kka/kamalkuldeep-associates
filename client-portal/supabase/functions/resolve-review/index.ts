import { corsHeaders, json, requireStaff } from "../_shared/portal.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const AREAS = new Set(["gst", "tds", "income_tax", "accounts", "mca", "other"]);

function areaFromRootSlug(slug: string) {
  const normalized = slug.trim().toLowerCase().replace(/-/g, "_");
  return AREAS.has(normalized) ? normalized : "other";
}

function periodIsValid(mode: string, period: string | null) {
  if (mode === "none") return !period;
  if (!period) return false;
  if (mode === "month") return /^(0[1-9]|1[0-2])$/.test(period);
  if (mode === "quarter") return /^Q[1-4]$/.test(period);
  return mode === "custom" && period.length <= 80;
}

async function selectedFilingNode(service: any, id: string) {
  const chain: any[] = [];
  let nextId: string | null = id;
  while (nextId && chain.length < 20) {
    const { data: node, error } = await service
      .from("filing_nodes")
      .select("id,parent_id,slug,node_type,enabled,requires_financial_year,period_mode")
      .eq("id", nextId)
      .maybeSingle();
    if (error) throw error;
    if (!node || !node.enabled) throw new Error("Select an active filing subject or folder.");
    chain.unshift(node);
    nextId = node.parent_id;
  }
  const root = chain[0];
  const selected = chain.at(-1);
  if (!root || root.node_type !== "subject" || selected?.id !== id || nextId) {
    throw new Error("The selected filing folder is invalid.");
  }
  return { selected, area: areaFromRootSlug(root.slug) };
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { user, service } = await requireStaff(req);
    const body = await req.json();
    const documentId = String(body.documentId ?? "").trim();
    const action = body.action === "reject" ? "reject" : body.action === "accept" ? "accept" : "";
    if (!documentId || !action) return json({ error: "A document and review action are required." }, 400);

    const rejectionReason = typeof body.rejectionReason === "string" ? body.rejectionReason.trim() : "";
    if (action === "reject" && (!rejectionReason || rejectionReason.length > 1000)) {
      return json({ error: "A rejection reason of 1,000 characters or fewer is required." }, 400);
    }

    const { data: doc, error: lookupError } = await service
      .from("documents")
      .select("id,storage_path,original_filename,status,client_id")
      .eq("id", documentId)
      .eq("status", "review")
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (!doc) return json({ error: "Review item not found or already resolved." }, 404);

    const now = new Date().toISOString();
    if (action === "reject") {
      const { data: updated, error } = await service
        .from("documents")
        .update({ status: "rejected", rejection_reason: rejectionReason, reviewed_by: user.id, reviewed_at: now })
        .eq("id", documentId)
        .eq("status", "review")
        .select("id,client_id,original_filename")
        .single();
      if (error) throw error;

      const { error: auditError } = await service.from("audit_logs").insert({
        actor_id: user.id,
        client_id: updated.client_id,
        action: "document_rejected",
        entity_type: "document",
        entity_id: updated.id,
        metadata: { filename: updated.original_filename, rejection_reason: rejectionReason },
      });
      return json({ state: "rejected", documentId: updated.id, auditLogged: !auditError });
    }

    const clientId = String(body.clientId ?? "").trim();
    const filingNodeId = String(body.filingNodeId ?? "").trim();
    if (!clientId || !filingNodeId) return json({ error: "Select a client and filing subject or folder before accepting." }, 400);

    const { data: client, error: clientError } = await service
      .from("clients")
      .select("id,cin")
      .eq("id", clientId)
      .eq("active", true)
      .maybeSingle();
    if (clientError) throw clientError;
    if (!client) return json({ error: "The selected client is unavailable." }, 400);

    const { selected, area } = await selectedFilingNode(service, filingNodeId);
    const suppliedArea = String(body.area ?? "").trim().toLowerCase().replace(/-/g, "_");
    if (suppliedArea !== area) return json({ error: "The selected filing folder does not match the document area." }, 400);
    if (area === "mca" && !client.cin) return json({ error: "MCA is available only for client profiles with a CIN." }, 400);

    const rawFinancialYear = typeof body.financialYear === "string" ? body.financialYear.trim() : "";
    const rawPeriod = typeof body.period === "string" ? body.period.trim() : "";
    const financialYear = selected.requires_financial_year ? rawFinancialYear : null;
    const period = selected.period_mode === "none" ? null : rawPeriod;
    if (selected.requires_financial_year && !/^\d{4}-\d{2}$/.test(financialYear ?? "")) {
      return json({ error: "Select a valid financial year for this filing folder." }, 400);
    }
    if (!periodIsValid(selected.period_mode, period)) {
      return json({ error: "Select a valid filing period for this folder." }, 400);
    }
    if (!doc.storage_path) return json({ error: "The review document has no stored file." }, 409);

    const authorization = req.headers.get("Authorization");
    if (!authorization) return json({ error: "Staff authorization is missing." }, 401);
    const storageResponse = await fetch(`${SUPABASE_URL}/functions/v1/filing-storage`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authorization },
      body: JSON.stringify({
        operation: "upload_from_supabase",
        storagePath: doc.storage_path,
        filename: doc.original_filename,
        clientId,
        filingNodeId,
        area,
        financialYear,
        filingPeriod: period,
      }),
    });
    const storageResult = await storageResponse.json().catch(() => ({}));
    if (!storageResponse.ok || !storageResult.success) {
      return json({ error: storageResult.error || `OneDrive transfer failed (HTTP ${storageResponse.status}).` }, 502);
    }

    const { data: updated, error: updateError } = await service
      .from("documents")
      .update({
        client_id: clientId,
        area,
        financial_year: financialYear,
        filing_period: period,
        filing_node_id: filingNodeId,
        status: "accepted",
        rejection_reason: null,
        reviewed_by: user.id,
        reviewed_at: now,
      })
      .eq("id", documentId)
      .eq("status", "review")
      .select("id,client_id,original_filename")
      .single();
    if (updateError) {
      console.error("Review document metadata update failed after OneDrive upload", updateError);
      return json({ error: "The file reached OneDrive, but KKA could not finalize its document record." }, 409);
    }

    let registryLinked = false;
    const registryId = storageResult.registry?.id;
    if (registryId) {
      const { error } = await service
        .from("onedrive_file_registry")
        .update({ document_id: updated.id, deleted_at: null, deletion_source: null, classification_status: "classified", updated_at: now })
        .eq("id", registryId);
      registryLinked = !error;
      if (error) console.error("OneDrive registry document link failed", error);
    }

    const { error: auditError } = await service.from("audit_logs").insert({
      actor_id: user.id,
      client_id: updated.client_id,
      action: "document_reviewed",
      entity_type: "document",
      entity_id: updated.id,
      metadata: {
        filename: updated.original_filename,
        area,
        financialYear,
        period,
        filingNodeId,
        storage: "onedrive",
        oneDriveItemId: storageResult.item?.id ?? null,
        oneDriveRegistryId: registryId ?? null,
      },
    });

    return json({
      state: "accepted",
      documentId: updated.id,
      oneDrive: { itemId: storageResult.item?.id ?? null, webUrl: storageResult.item?.webUrl ?? null },
      oneDriveRegistryLinked: registryLinked,
      auditLogged: !auditError,
    });
  } catch (error) {
    console.error("resolve-review error", error);
    return json({ error: error instanceof Error ? error.message : "Review could not be resolved." }, 400);
  }
});
