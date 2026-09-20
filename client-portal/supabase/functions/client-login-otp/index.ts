import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const allowedOrigin = Deno.env.get("PORTAL_ALLOWED_ORIGIN") ?? "https://portal.ca-kka.com";
const resendKey = Deno.env.get("RESEND_API_KEY");
const otpPepper = Deno.env.get("KKA_OTP_PEPPER") ?? serviceKey;

const corsHeaders = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const clean = (v: unknown) => String(v ?? "").trim();

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "••••••";
  const shown = local.length <= 2 ? local[0] : local.slice(0, 2);
  return `${shown}${"•".repeat(Math.max(3, local.length - shown.length))}@${domain}`;
}

function maskMobile(mobile: string | null) {
  if (!mobile) return null;
  const digits = mobile.replace(/\D/g, "");
  if (digits.length < 4) return "••••";
  return `+${digits.slice(0, 2)} ${"•".repeat(Math.max(4, digits.length - 6))}${digits.slice(-4)}`;
}

function generateOtp() {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return String(bytes[0] % 1000000).padStart(6, "0");
}

async function otpHash(challengeId: string, otp: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(otpPepper),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${challengeId}:${otp}`),
  );
  return [...new Uint8Array(mac)].map(v => v.toString(16).padStart(2, "0")).join("");
}

async function authenticate(email: string, password: string) {
  const auth = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  return auth.auth.signInWithPassword({ email, password });
}

async function sendOtpEmail(email: string, fullName: string, otp: string) {
  if (!resendKey) throw new Error("RESEND_API_KEY is not configured");

  const text = `Kamal Kuldeep & Associates\n\nKKA Client Portal — Security Verification\n\nDear ${fullName || "Client"},\n\nYour KKA Client Portal verification code is: ${otp}\n\nThis 6-digit code expires in 5 minutes.\n\nIf you did not attempt to sign in to the KKA Client Portal, please contact Kamal Kuldeep & Associates. Do not share this code with anyone.\n\nRegards,\nKamal Kuldeep & Associates`;

  const html = `<!doctype html><html><body style="margin:0;background:#f5f6f8;font-family:Arial,sans-serif;color:#18212b"><div style="max-width:620px;margin:32px auto;background:#fff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden"><div style="padding:24px 28px;background:#111827;color:#fff"><div style="font-size:24px;font-weight:800;letter-spacing:.08em">KKA</div><div style="font-size:11px;letter-spacing:.18em;opacity:.75;margin-top:4px">CLIENT PLATFORM</div></div><div style="padding:30px 28px"><div style="font-size:12px;letter-spacing:.12em;color:#6b7280;font-weight:700">SECURITY VERIFICATION</div><h1 style="font-size:24px;margin:10px 0 8px">Verify your KKA Client Portal sign-in</h1><p style="color:#4b5563">Dear ${fullName || "Client"},</p><p style="color:#4b5563">Use the verification code below to complete your sign-in.</p><div style="margin:26px 0;padding:20px;text-align:center;background:#f3f4f6;border-radius:12px;font-size:36px;font-weight:800;letter-spacing:.24em">${otp}</div><p style="color:#4b5563"><strong>This code expires in 5 minutes.</strong> Do not share it with anyone.</p><p style="font-size:13px;color:#6b7280">If you did not attempt to sign in to the KKA Client Portal, please contact Kamal Kuldeep &amp; Associates.</p></div><div style="padding:18px 28px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280">Kamal Kuldeep &amp; Associates · KKA Client Portal</div></div></body></html>`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Kamal Kuldeep & Associates <notifications@notify.ca-kka.com>",
      to: [email],
      reply_to: ["notifications@notify.ca-kka.com"],
      subject: "KKA Client Portal — Security Verification",
      text,
      html,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`OTP email delivery failed (${response.status})${detail ? `: ${detail.slice(0, 160)}` : ""}`);
  }
  return await response.json().catch(() => ({}));
}

async function getIdentity(userId: string) {
  const service = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const [{ data: profile }, { data: membership }] = await Promise.all([
    service.from("profiles").select("role,full_name,active,email_2fa_enabled").eq("id", userId).maybeSingle(),
    service.from("client_memberships").select("client_id,can_upload,clients(id,mobile,active)").eq("user_id", userId).maybeSingle(),
  ]);
  return { service, profile, membership };
}

async function requestOtp(email: string, password: string) {
  const authResult = await authenticate(email, password);
  if (authResult.error || !authResult.data.user || !authResult.data.session) {
    return json({ error: "Unable to sign in. Check your credentials or contact KKA." }, 401);
  }

  const user = authResult.data.user;
  const { service, profile, membership } = await getIdentity(user.id);

  if (!profile?.active) {
    return json({ error: "Unable to sign in. Check your credentials or contact KKA." }, 403);
  }

  if (["admin", "staff"].includes(profile.role)) {
    const s = authResult.data.session;
    return json({
      ok: true,
      requiresOtp: false,
      role: profile.role,
      session: {
        access_token: s.access_token,
        refresh_token: s.refresh_token,
        expires_in: s.expires_in,
        expires_at: s.expires_at,
        token_type: s.token_type,
      },
    });
  }

  if (profile.role !== "client" || !membership?.client_id || membership.clients?.active !== true) {
    return json({ error: "Unable to sign in. Check your credentials or contact KKA." }, 403);
  }

  if (profile.email_2fa_enabled === false) {
    const s = authResult.data.session;
    return json({
      ok: true,
      requiresOtp: false,
      role: "client",
      session: {
        access_token: s.access_token,
        refresh_token: s.refresh_token,
        expires_in: s.expires_in,
        expires_at: s.expires_at,
        token_type: s.token_type,
      },
    });
  }

  const existing = await service
    .from("client_login_otp_challenges")
    .select("id,last_sent_at,expires_at")
    .eq("user_id", user.id)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing.data) {
    const age = Date.now() - new Date(existing.data.last_sent_at).getTime();
    if (age < 60000) {
      return json({
        ok: true,
        requiresOtp: true,
        challengeId: existing.data.id,
        maskedEmail: maskEmail(user.email ?? email),
        maskedMobile: maskMobile(membership.clients?.mobile ?? null),
        expiresIn: Math.max(0, Math.floor((new Date(existing.data.expires_at).getTime() - Date.now()) / 1000)),
        resendAfter: Math.ceil((60000 - age) / 1000),
      });
    }
  }

  await service
    .from("client_login_otp_challenges")
    .delete()
    .eq("user_id", user.id)
    .is("consumed_at", null);

  const challengeId = crypto.randomUUID();
  const otp = generateOtp();
  const hash = await otpHash(challengeId, otp);
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  const { error: insertError } = await service
    .from("client_login_otp_challenges")
    .insert({
      id: challengeId,
      user_id: user.id,
      client_id: membership.client_id,
      email: user.email ?? email,
      otp_hash: hash,
      expires_at: expiresAt,
      attempts: 0,
      max_attempts: 5,
      last_sent_at: new Date().toISOString(),
    });

  if (insertError) {
    return json({ error: "Security verification could not be started. Please try again." }, 500);
  }

  try {
    await sendOtpEmail(user.email ?? email, profile.full_name ?? "Client", otp);
  } catch (error) {
    await service.from("client_login_otp_challenges").delete().eq("id", challengeId);
    console.error("KKA OTP delivery error", error instanceof Error ? error.message : error);
    return json({ error: "The security code could not be delivered. Please try again shortly." }, 502);
  }

  return json({
    ok: true,
    requiresOtp: true,
    challengeId,
    maskedEmail: maskEmail(user.email ?? email),
    maskedMobile: maskMobile(membership.clients?.mobile ?? null),
    expiresIn: 300,
    resendAfter: 60,
  });
}

async function verifyOtp(email: string, password: string, challengeId: string, otp: string) {
  if (!/^\d{6}$/.test(otp) || !/^[0-9a-f-]{36}$/i.test(challengeId)) {
    return json({ error: "Invalid verification code." }, 400);
  }

  const firstAuth = await authenticate(email, password);
  if (firstAuth.error || !firstAuth.data.user) {
    return json({ error: "Unable to complete sign-in. Please start again." }, 401);
  }

  const userId = firstAuth.data.user.id;
  const { service, profile, membership } = await getIdentity(userId);
  if (profile?.role !== "client" || !profile.active || !membership?.client_id || membership.clients?.active !== true) {
    return json({ error: "Unable to complete sign-in. Please start again." }, 403);
  }

  if (profile.email_2fa_enabled === false) {
    const finalAuth = await authenticate(email, password);
    if (finalAuth.error || !finalAuth.data.session) {
      return json({ error: "The password verification could not be completed. Please sign in again." }, 401);
    }
    const s = finalAuth.data.session;
    return json({
      ok: true,
      requiresOtp: false,
      role: "client",
      session: {
        access_token: s.access_token,
        refresh_token: s.refresh_token,
        expires_in: s.expires_in,
        expires_at: s.expires_at,
        token_type: s.token_type,
      },
    });
  }

  const hash = await otpHash(challengeId, otp);
  const { data: consumed, error: consumeError } = await service.rpc("consume_client_login_otp", {
    p_challenge_id: challengeId,
    p_otp_hash: hash,
    p_now: new Date().toISOString(),
  });

  if (consumeError || !consumed?.[0]) {
    return json({ error: "Unable to verify the security code. Please start again." }, 500);
  }

  const result = consumed[0].result;
  if (result !== "verified") {
    const messages: Record<string, string> = {
      invalid: "Incorrect security code. Please try again.",
      expired: "This security code has expired. Please request a new code.",
      locked: "Too many incorrect attempts. Please request a new code.",
      used: "This security code has already been used. Please request a new code.",
      not_found: "This security code is no longer valid. Please request a new code.",
    };
    return json({ error: messages[result] ?? "Invalid security code.", attemptsLeft: consumed[0].attempts_left ?? 0 }, 401);
  }

  const finalAuth = await authenticate(email, password);
  if (finalAuth.error || !finalAuth.data.session) {
    return json({ error: "The password verification could not be completed. Please sign in again." }, 401);
  }

  const s = finalAuth.data.session;
  return json({
    ok: true,
    requiresOtp: false,
    role: "client",
    session: {
      access_token: s.access_token,
      refresh_token: s.refresh_token,
      expires_in: s.expires_in,
      expires_at: s.expires_at,
      token_type: s.token_type,
    },
  });
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json();
    const action = clean(body.action);
    const email = clean(body.email).toLowerCase();
    const password = String(body.password ?? "");

    if (!email || !password || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: "Email and password are required." }, 400);
    }

    if (action === "request") return await requestOtp(email, password);
    if (action === "verify") return await verifyOtp(email, password, clean(body.challengeId), clean(body.otp));
    return json({ error: "Invalid request." }, 400);
  } catch (error) {
    console.error("KKA client login OTP error", error instanceof Error ? error.message : error);
    return json({ error: "Unable to complete sign-in. Please try again." }, 500);
  }
});
