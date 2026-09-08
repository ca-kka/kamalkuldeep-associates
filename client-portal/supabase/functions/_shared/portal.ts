import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("PORTAL_ALLOWED_ORIGIN") ?? "https://portal.ca-kka.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

export function serviceClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function requireStaff(req: Request) {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Missing staff session");
  const auth = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: { user }, error } = await auth.auth.getUser(token);
  if (error || !user) throw new Error("Invalid or expired session");
  const service = serviceClient();
  const { data: profile } = await service.from("profiles").select("role, active").eq("id", user.id).maybeSingle();
  if (!profile?.active || !["admin", "staff"].includes(profile.role)) throw new Error("Staff access required");
  return { user, service };
}

export function cleanFilename(filename: string) {
  return filename.replace(/[\\/:*?"<>|\x00-\x1F]/g, "_").slice(0, 220);
}

export function sha256Hex(buffer: ArrayBuffer) {
  return crypto.subtle.digest("SHA-256", buffer).then(hash => [...new Uint8Array(hash)].map(v => v.toString(16).padStart(2, "0")).join(""));
}

