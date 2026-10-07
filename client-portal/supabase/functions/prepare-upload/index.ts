import { cleanFilename, corsHeaders, json, requireStaff } from "../_shared/portal.ts";

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9,
  september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};
const AREAS = new Set(["gst", "tds", "income_tax", "accounts", "mca", "other"]);
const ALLOWED_CONTENT_TYPES=new Set(["application/pdf","image/jpeg","image/png","image/gif","image/webp","image/tiff","image/bmp","application/msword","application/vnd.openxmlformats-officedocument.wordprocessingml.document","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","application/vnd.ms-excel","application/vnd.ms-powerpoint","application/vnd.openxmlformats-officedocument.presentationml.presentation","text/csv","text/plain","application/rtf","application/zip"]);
const ALLOWED_CONTENT_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
]);

const compact = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, "");
const normal = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
const normalizeArea = (value: string) => {
  const area = value.trim().toLowerCase().replace(/-/g, "_");
  return AREAS.has(area) ? area : "other";
};

function classify(filename: string, clients: any[]) {
  const raw = filename.toUpperCase();
  const flat = compact(filename);
  const words = normal(filename);
  const exact = clients.find(client => [client.pan, client.tan, client.cin, client.gstin]
    .filter(Boolean).some((identifier: string) => flat.includes(compact(identifier))));
  let client = exact;
  let confidence = exact ? 100 : 0;
  const reasons: string[] = exact ? ["Exact PAN/TAN/CIN/GSTIN found in filename"] : [];
  if (!client) {
    client = clients.find(item => [item.legal_name, ...(item.filename_aliases ?? [])]
      .filter(Boolean).some((name: string) => {
        const normalized = normal(name);
        return normalized.length >= 5 && words.includes(normalized);
      }));
    if (client) {
      confidence = 84;
      reasons.push("Client legal name or alias found in filename");
    }
  }

  let area = "other";
  if (/GST|GSTR|GSTR1|GSTR3B/.test(raw)) area = "gst";
  else if (/TDS|24Q|26Q|27Q|27EQ/.test(raw)) area = "tds";
  else if (/\bITR\b|INCOME[ _-]?TAX|FORM[ _-]?16/.test(raw)) area = "income_tax";
  else if (/BALANCE[ _-]?SHEET|TRIAL[ _-]?BALANCE|LEDGER|FINANCIALS?|P&L/.test(raw)) area = "accounts";
  else if (/\bMCA\b|\b(?:AOC|MGT|DIR|INC|CHG|PAS)[ _-]?\d{1,2}[A-Z]?\b/.test(raw)) area = "mca";
  if (area !== "other") reasons.push(`Document area inferred as ${area}`);

  const fy = raw.match(/(?:FY|F\.Y\.?)[ _-]?(20\d{2})[ _-]?(?:-|TO)?[ _-]?(\d{2}|20\d{2})/)
    ?? raw.match(/\b(20\d{2})-(\d{2})\b/);
  let financialYear: string | null = null;
  if (fy) {
    financialYear = `${fy[1]}-${fy[2].length === 2 ? fy[2] : fy[2].slice(2)}`;
    reasons.push(`Financial year inferred as ${financialYear}`);
  }
  const monthName = Object.keys(MONTHS).sort((left, right) => right.length - left.length)
    .find(name => new RegExp(`\\b${name}\\b`, "i").test(filename));
  const quarter = raw.match(/(?:\bQ([1-4])\b|QUARTER[ _-]?([1-4]))/);
  const period = area === "gst" && monthName
    ? String(MONTHS[monthName]).padStart(2, "0")
    : area === "tds" && quarter
      ? `Q${quarter[1] ?? quarter[2]}`
      : null;
  if (period) reasons.push(`Period inferred as ${period}`);
  return { clientId: client?.id ?? null, confidence, reasons, area, financialYear, period };
}

async function filingNodeContext(service: any, id: string) {
  const chain: any[] = [];
  let nextId: string | null = id;
  while (nextId && chain.length < 20) {
    const { data: node, error } = await service.from("filing_nodes")
      .select("id,parent_id,name,slug,node_type,enabled,client_upload_enabled,requires_financial_year,period_mode")
      .eq("id", nextId).maybeSingle();
    if (error) throw error;
    if (!node || !node.enabled) throw new Error("Selected filing folder is unavailable.");
    chain.unshift(node);
    nextId = node.parent_id;
  }
  const root = chain[0];
  const selected = chain.at(-1);
  if (!root || root.node_type !== "subject" || selected?.id !== id || nextId) {
    throw new Error("The selected filing folder is invalid.");
  }
  return { selected, area: normalizeArea(root.slug) };
}

function validPeriod(mode: string, period: string | null) {
  if (mode === "none") return !period;
  if (!period) return false;
  if (mode === "month") return /^(0[1-9]|1[0-2])$/.test(period);
  if (mode === "quarter") return /^Q[1-4]$/.test(period);
  return mode === "custom" && period.length <= 80;
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { user, service } = await requireStaff(req);
    const body = await req.json();
    const filename = cleanFilename(String(body.filename ?? ""));
    const sha256 = String(body.sha256 ?? "").toLowerCase();
    const byteSize = Number(body.byteSize);
    const contentType = String(body.contentType ?? "application/octet-stream").split(";")[0].trim().toLowerCase();
    if (!ALLOWED_CONTENT_TYPES.has(contentType)) return json({ error: "Unsupported file format. Use PDF, images, Word, Excel, PowerPoint, CSV, TXT, RTF or ZIP." }, 415);
    if (!filename || !/^[a-f0-9]{64}$/.test(sha256) || !Number.isSafeInteger(byteSize) || byteSize < 1 || byteSize > 52428800) {
      return json({ error: "Invalid file metadata." }, 400);
    }
    if (!ALLOWED_CONTENT_TYPES.has(contentType)) return json({ error: "Unsupported file format. Use PDF, Excel, CSV, JPG or PNG." }, 415);

    const { data: clients, error: clientError } = await service.from("clients")
      .select("id,legal_name,pan,tan,cin,gstin,filename_aliases")
      .eq("active", true);
    if (clientError) throw clientError;

    let result = classify(String(body.filename ?? ""), clients ?? []);
    let filingNodeId: string | null = null;
    let filingNode: any = null;
    const manual = body.manual === true;

    if (manual) {
      const clientId = String(body.clientId ?? "").trim();
      const suppliedNodeId = String(body.filingNodeId ?? "").trim();
      if (!clientId) return json({ error: "A client is required." }, 400);
      if (!suppliedNodeId) return json({ error: "Select a filing subject or folder so this upload can be saved to OneDrive." }, 400);
      const selectedClient = (clients ?? []).find((client: any) => client.id === clientId);
      if (!selectedClient) return json({ error: "Selected client is not active or could not be found." }, 400);

      const context = await filingNodeContext(service, suppliedNodeId);
      filingNode = context.selected;
      if (!filingNode.client_upload_enabled) return json({ error: "This filing folder is not enabled for uploads." }, 400);
      const area = normalizeArea(String(body.area ?? ""));
      if (area !== context.area) return json({ error: "The selected filing folder does not match the document area." }, 400);
      if (area === "mca" && !selectedClient.cin) return json({ error: "MCA is available only for client profiles with a CIN." }, 400);

      const suppliedYear = typeof body.financialYear === "string" ? body.financialYear.trim() : "";
      const financialYear = filingNode.requires_financial_year ? suppliedYear : null;
      const suppliedPeriod = typeof body.period === "string" ? body.period.trim() : "";
      const period = filingNode.period_mode === "none" ? null : suppliedPeriod;
      if (filingNode.requires_financial_year && !/^\d{4}-\d{2}$/.test(financialYear ?? "")) {
        return json({ error: "A valid financial year is required for this filing folder." }, 400);
      }
      if (!validPeriod(filingNode.period_mode, period)) return json({ error: "A valid filing period is required for this folder." }, 400);

      filingNodeId = filingNode.id;
      result = {
        clientId,
        confidence: 100,
        reasons: ["Manual classification selected by KKA staff", `Filing folder selected: ${filingNode.name}`],
        area,
        financialYear,
        period,
      };
    } else if (result.clientId) {
      const subjectSlug = result.area.replace(/_/g, "-");
      const { data: subject, error } = await service.from("filing_nodes")
        .select("id,parent_id,name,slug,node_type,enabled,client_upload_enabled,requires_financial_year,period_mode")
        .eq("slug", subjectSlug).eq("node_type", "subject").eq("enabled", true).maybeSingle();
      if (error) throw error;
      if (subject) filingNodeId = subject.id;
      else result.reasons.push("No active filing subject is configured; staff review is required.");
    }

    if (result.clientId) {
      const { data: duplicate, error } = await service.from("documents")
        .select("id,client_id")
        .eq("client_id", result.clientId)
        .eq("sha256", sha256)
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (duplicate) return json({ state: "duplicate", existingDocumentId: duplicate.id, message: "An identical file is already stored for this client; no upload URL was issued." }, 409);
    }

    const objectPath = `staging/${crypto.randomUUID()}`;
    const expiresAt = new Date(Date.now() + 8 * 60 * 1000).toISOString();
    const { data: upload, error: uploadError } = await service.from("document_uploads").insert({
      requested_by: user.id,
      original_filename: String(body.filename),
      sanitized_filename: filename,
      content_type: contentType,
      byte_size: byteSize,
      sha256,
      object_path: objectPath,
      proposed_client_id: result.clientId,
      proposed_area: result.area,
      proposed_financial_year: result.financialYear,
      proposed_period: result.period,
      proposed_filing_node_id: filingNodeId,
      confidence: result.confidence,
      reasons: result.reasons,
      expires_at: expiresAt,
    }).select().single();
    if (uploadError) throw uploadError;

    const { data: signed, error: signedError } = await service.storage.from("client-documents").createSignedUploadUrl(objectPath);
    if (signedError) throw signedError;
    return json({
      state: "prepared",
      uploadId: upload.id,
      objectPath,
      signedUrl: signed.signedUrl,
      token: signed.token,
      expiresAt,
      classification: { ...result, filingNodeId, filingNode: filingNode ? { id: filingNode.id, name: filingNode.name, periodMode: filingNode.period_mode, requiresFinancialYear: filingNode.requires_financial_year } : null },
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Upload could not be prepared." }, 400);
  }
});
