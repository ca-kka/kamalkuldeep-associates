import { cleanFilename, corsHeaders, json, requireStaff } from "../_shared/portal.ts";

const months: Record<string, number> = { jan:1,january:1,feb:2,february:2,mar:3,march:3,apr:4,april:4,may:5,jun:6,june:6,jul:7,july:7,aug:8,august:8,sep:9,september:9,oct:10,october:10,nov:11,november:11,dec:12,december:12 };
const compact = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, "");
const normal = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();

function classify(filename: string, clients: Array<any>) {
  const raw = filename.toUpperCase(), flat = compact(filename), words = normal(filename);
  const exact = clients.find(c => [c.pan,c.tan,c.cin,c.gstin].filter(Boolean).some((id: string) => flat.includes(compact(id))));
  let client = exact, confidence = exact ? 100 : 0, reasons: string[] = exact ? ["Exact PAN/TAN/CIN/GSTIN found in filename"] : [];
  if (!client) {
    client = clients.find(c => [c.legal_name, ...(c.filename_aliases ?? [])].filter(Boolean).some((name: string) => {
      const n = normal(name); return n.length >= 5 && words.includes(n);
    }));
    if (client) { confidence = 84; reasons.push("Client legal name or alias found in filename"); }
  }
  let area = "other";
  if (/GST|GSTR|GSTR1|GSTR3B/.test(raw)) area = "gst";
  else if (/TDS|24Q|26Q|27Q|27EQ/.test(raw)) area = "tds";
  else if (/\bITR\b|INCOME[ _-]?TAX|FORM[ _-]?16/.test(raw)) area = "income_tax";
  else if (/BALANCE[ _-]?SHEET|TRIAL[ _-]?BALANCE|LEDGER|FINANCIALS?|P&L/.test(raw)) area = "accounts";
  if (area !== "other") reasons.push(`Document area inferred as ${area}`);
  const fyMatch = raw.match(/(?:FY|F\.Y\.?)[ _-]?(20\d{2})[ _-]?(?:-|TO)?[ _-]?(\d{2}|20\d{2})/) ?? raw.match(/\b(20\d{2})-(\d{2})\b/);
  let financialYear: string | null = null;
  if (fyMatch) { const start = fyMatch[1]; financialYear = `${start}-${fyMatch[2].length === 2 ? fyMatch[2] : fyMatch[2].slice(2)}`; reasons.push(`Financial year inferred as ${financialYear}`); }
  const monthMatch = Object.keys(months).sort((a,b) => b.length-a.length).find(name => new RegExp(`\\b${name}\\b`, "i").test(filename));
  const quarterMatch = raw.match(/(?:\bQ([1-4])\b|QUARTER[ _-]?([1-4]))/);
  const period = area === "gst" && monthMatch ? `${months[monthMatch]}`.padStart(2, "0") : area === "tds" && quarterMatch ? `Q${quarterMatch[1] ?? quarterMatch[2]}` : null;
  if (period) reasons.push(`Period inferred as ${period}`);
  return { clientId: client?.id ?? null, confidence, reasons, area, financialYear, period };
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { user, service } = await requireStaff(req);
    const body = await req.json();
    const filename = cleanFilename(String(body.filename ?? ""));
    const sha256 = String(body.sha256 ?? "").toLowerCase();
    const byteSize = Number(body.byteSize);
    const contentType = String(body.contentType ?? "application/octet-stream");
    if (!filename || !/^[a-f0-9]{64}$/.test(sha256) || !Number.isSafeInteger(byteSize) || byteSize < 1 || byteSize > 52428800) return json({ error: "Invalid file metadata" }, 400);
    const { data: duplicate } = await service.from("documents").select("id, client_id").eq("sha256", sha256).limit(1).maybeSingle();
    if (duplicate) return json({ state: "duplicate", existingDocumentId: duplicate.id, message: "An identical file is already stored; no upload URL was issued." }, 409);
    const { data: clients, error: clientError } = await service.from("clients").select("id, legal_name, pan, tan, cin, gstin, filename_aliases").eq("active", true);
    if (clientError) throw clientError;
    const result = classify(filename, clients ?? []);
    const objectPath = `staging/${crypto.randomUUID()}`;
    const expiresAt = new Date(Date.now() + 8 * 60 * 1000).toISOString();
    const { data: upload, error: uploadError } = await service.from("document_uploads").insert({ requested_by:user.id, original_filename:String(body.filename), sanitized_filename:filename, content_type:contentType, byte_size:byteSize, sha256, object_path:objectPath, proposed_client_id:result.clientId, proposed_area:result.area, proposed_financial_year:result.financialYear, proposed_period:result.period, confidence:result.confidence, reasons:result.reasons, expires_at:expiresAt }).select().single();
    if (uploadError) throw uploadError;
    const { data: signed, error: signedError } = await service.storage.from("client-documents").createSignedUploadUrl(objectPath);
    if (signedError) throw signedError;
    return json({ state: "prepared", uploadId: upload.id, signedUrl: signed.signedUrl, token: signed.token, expiresAt, classification: result });
  } catch (error) { return json({ error: error instanceof Error ? error.message : "Upload could not be prepared" }, 401); }
});

