import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ORIGIN = Deno.env.get("PORTAL_ALLOWED_ORIGIN") ?? "https://portal.ca-kka.com";
const cors = { "Access-Control-Allow-Origin": ORIGIN, "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

function b64url(bytes: Uint8Array) { let s = ""; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function utf8(s: string) { return new TextEncoder().encode(s); }
async function sign(payload: string, key: string) { const k = await crypto.subtle.importKey("raw", utf8(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", k, utf8(payload)))); }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const authz = req.headers.get("Authorization") ?? "";
    const token = authz.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Authentication required" }, 401);
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: { user }, error } = await anon.auth.getUser(token);
    if (error || !user) return json({ error: "Invalid session" }, 401);
    const service = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: profile } = await service.from("profiles").select("role,active").eq("id", user.id).maybeSingle();
    if (!profile || !profile.active || !["admin", "staff"].includes(profile.role)) return json({ error: "Staff access required" }, 403);
    const key = Deno.env.get("MICROSOFT_ONEDRIVE_TOKEN_ENCRYPTION_KEY");
    const clientId = Deno.env.get("MICROSOFT_ONEDRIVE_CLIENT_ID");
    if (!key || !clientId) return json({ error: "OneDrive configuration is incomplete" }, 500);
    const { data: existingConnections, error: connectionLookupError } = await service
      .from("storage_connections")
      .select("owner_user_id")
      .eq("provider", "onedrive")
      .limit(2);
    if (connectionLookupError) return json({ error: "Unable to resolve the shared OneDrive connection" }, 500);
    if ((existingConnections ?? []).length > 1) return json({ error: "Multiple OneDrive connections exist. Please contact KKA support before reconnecting." }, 409);
    const connectionOwnerId = existingConnections?.[0]?.owner_user_id ?? user.id;
    const payload = b64url(utf8(JSON.stringify({ sub: connectionOwnerId, exp: Math.floor(Date.now()/1000) + 600, n: crypto.randomUUID() })));
    const state = `${payload}.${await sign(payload, key)}`;
    const params = new URLSearchParams({ client_id: clientId, response_type: "code", redirect_uri: `${url}/functions/v1/onedrive-oauth-callback`, response_mode: "query", scope: "openid profile offline_access User.Read Files.ReadWrite", state, prompt: "select_account" });
    return json({ authorizationUrl: `https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?${params}` });
  } catch (e) { return json({ error: e instanceof Error ? e.message : "Unable to start OneDrive authorization" }, 500); }
});
