import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("PORTAL_ALLOWED_ORIGIN") ?? "https://portal.ca-kka.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const months: Record<string, number> = { jan:1,january:1,feb:2,february:2,mar:3,march:3,apr:4,april:4,may:5,jun:6,june:6,jul:7,july:7,aug:8,august:8,sep:9,september:9,oct:10,october:10,nov:11,november:11,dec:12,december:12 };
const allowedContentTypes = new Set(["application/pdf", "image/jpeg", "image/png", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel", "text/csv"]);
const compact = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, "");
const normal = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
const cleanFilename = (filename: string) => filename.replace(/[\\/:*?"<>|\x00-\x1F]/g, "_").slice(0, 220);

function classify(filename: string, client: any) {
  const raw = filename.toUpperCase();
  let area = "other";
  if (/GST|GSTR|GSTR1|GSTR3B/.test(raw)) area = "gst";
  else if (/TDS|24Q|26Q|27Q|27EQ/.test(raw)) area = "tds";
  else if (client.cin && /\bMCA\b|\bROC\b|AOC[ _-]?[0-9]|MGT[ _-]?[0-9]|DIR[ _-]?[0-9]/.test(raw)) area = "mca";
  else if (/\bITR\b|INCOME[ _-]?TAX|FORM[ _-]?16/.test(raw)) area = "income_tax";
  else if (/BALANCE[ _-]?SHEET|TRIAL[ _-]?BALANCE|LEDGER|FINANCIALS?|P&L/.test(raw)) area = "accounts";
  const reasons = [`Client-selected profile: ${client.display_name || client.legal_name}`];
  const identifiers = [client.pan, client.tan, client.cin, client.gstin].filter(Boolean).map(compact);
  if (identifiers.some((id: string) => compact(filename).includes(id))) reasons.push("Client identifier found in filename");
  if (area !== "other") reasons.push(`Document area inferred as ${area}`);
  const fyMatch = raw.match(/(?:FY|F\.Y\.?)[ _-]?(20\d{2})[ _-]?(?:-|TO)?[ _-]?(\d{2}|20\d{2})/) ?? raw.match(/\b(20\d{2})-(\d{2})\b/);
  const financialYear = fyMatch ? `${fyMatch[1]}-${fyMatch[2].length === 2 ? fyMatch[2] : fyMatch[2].slice(2)}` : null;
  if (financialYear) reasons.push(`Financial year inferred as ${financialYear}`);
  const monthMatch = Object.keys(months).sort((a,b) => b.length-a.length).find(name => new RegExp(`\\b${name}\\b`, "i").test(filename));
  const quarterMatch = raw.match(/(?:\bQ([1-4])\b|QUARTER[ _-]?([1-4]))/);
  const period = area === "gst" && monthMatch ? `${months[monthMatch]}`.padStart(2, "0") : area === "tds" && quarterMatch ? `Q${quarterMatch[1] ?? quarterMatch[2]}` : null;
  if (period) reasons.push(`Period inferred as ${period}`);
  return { area, financialYear, period, confidence: 100, reasons };
}

async function authenticate(req: Request) {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Missing client session");
  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const auth = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: { user }, error } = await auth.auth.getUser(token);
  if (error || !user) throw new Error("Invalid or expired client session");
  const service = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: membership } = await service.from("client_memberships").select("client_id,can_upload").eq("user_id", user.id).maybeSingle();
  if (!membership) throw new Error("Client membership not found");
  if (!membership.can_upload) throw new Error("Client document upload is disabled");
  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return { user, membership, service, caller };
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { user, service, caller } = await authenticate(req);
    const body = await req.json();
    const filename = cleanFilename(String(body.filename ?? ""));
    const sha256 = String(body.sha256 ?? "").toLowerCase();
    const byteSize = Number(body.byteSize);
    const contentType = String(body.contentType ?? "application/octet-stream").split(";")[0].trim().toLowerCase();
    const clientId = String(body.clientId ?? "");
    if (!filename || !clientId || !/^[a-f0-9]{64}$/.test(sha256) || !Number.isSafeInteger(byteSize) || byteSize < 1 || byteSize > 52428800) return json({ error: "Invalid file metadata" }, 400);
    if (!allowedContentTypes.has(contentType)) return json({ error: "Unsupported file format. Use PDF, Excel, CSV, JPG or PNG." }, 415);
    const { data: client, error: clientError } = await caller.from("clients").select("id,legal_name,display_name,pan,tan,cin,gstin,active").eq("id", clientId).eq("active", true).maybeSingle();
    if (clientError) throw clientError;
    if (!client) return json({ error: "Selected profile is not accessible or is inactive" }, 403);
    const { data: duplicate, error: duplicateError } = await service.from("documents").select("id,client_id").eq("client_id", clientId).eq("sha256", sha256).is("deleted_at", null).limit(1).maybeSingle();
    if (duplicateError) throw duplicateError;
    if (duplicate) return json({ state: "duplicate", existingDocumentId: duplicate.id, message: "An identical file is already stored; no upload URL was issued." }, 409);
    const classification = classify(filename, client);
    const objectPath = `staging/${crypto.randomUUID()}`;
    const expiresAt = new Date(Date.now() + 8 * 60 * 1000).toISOString();
    const { data: upload, error: uploadError } = await service.from("document_uploads").insert({ requested_by:user.id, original_filename:String(body.filename), sanitized_filename:filename, content_type:contentType, byte_size:byteSize, sha256, object_path:objectPath, proposed_client_id:clientId, proposed_area:classification.area, proposed_financial_year:classification.financialYear, proposed_period:classification.period, confidence:classification.confidence, reasons:classification.reasons, expires_at:expiresAt }).select().single();
    if (uploadError) throw uploadError;
    const { data: signed, error: signedError } = await service.storage.from("client-documents").createSignedUploadUrl(objectPath);
    if (signedError) throw signedError;
    return json({ state: "prepared", uploadId: upload.id, objectPath, signedUrl: signed.signedUrl, token: signed.token, expiresAt, classification });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Client upload could not be prepared";
    const status = /disabled|membership|session|accessible/i.test(message) ? 403 : 400;
    return json({ error: message }, status);
  }
});
