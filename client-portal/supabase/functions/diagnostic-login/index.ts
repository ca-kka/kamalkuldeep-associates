import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const allowedOrigin = Deno.env.get("PORTAL_ALLOWED_ORIGIN") ?? "https://portal.ca-kka.com";
const corsHeaders = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (origin && origin !== allowedOrigin) return json({ error: "Origin not allowed." }, 403);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST required." }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password || password.length > 1024) {
      return json({ error: "Enter your KKA staff email and password." }, 400);
    }

    const auth = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
    const { data, error } = await auth.auth.signInWithPassword({ email, password });
    if (error || !data.user || !data.session) {
      return json({ error: "Unable to sign in to diagnostics. Check your credentials and staff access." }, 401);
    }

    const service = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
    const { data: profile, error: profileError } = await service
      .from("profiles")
      .select("role,active")
      .eq("id", data.user.id)
      .maybeSingle();

    if (profileError) {
      console.error("diagnostic-login profile check failed", profileError.code ?? "unknown");
      return json({ error: "Diagnostics sign-in is temporarily unavailable." }, 503);
    }
    if (profile?.active !== true || !["admin", "staff"].includes(profile.role)) {
      return json({ error: "Unable to sign in to diagnostics. Check your credentials and staff access." }, 401);
    }

    return json({
      ok: true,
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_in: data.session.expires_in,
        expires_at: data.session.expires_at,
        token_type: data.session.token_type,
      },
    });
  } catch {
    return json({ error: "Diagnostics sign-in is temporarily unavailable." }, 500);
  }
});