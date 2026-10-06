import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("PORTAL_ALLOWED_ORIGIN") ?? "https://portal.ca-kka.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const serviceClient = () => createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

async function sendPasswordChangedEmail(email: string, fullName: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return { sent: false, error: "RESEND_API_KEY is not configured" };

  const text = `Kamal Kuldeep & Associates\n\nYour KKA Client Portal password was changed successfully.\n\nDear ${fullName || "Client"},\n\nYour private password for the KKA Client Portal has been changed successfully.\n\nFor security, please sign in again using your new password to continue to your workspace.\n\nPortal: https://portal.ca-kka.com\n\nIf you did not make this change, please contact KKA immediately.\n\nRegards,\nKamal Kuldeep & Associates`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Kamal Kuldeep & Associates <notifications@notify.ca-kka.com>",
      to: [email],
      reply_to: ["notifications@notify.ca-kka.com"],
      subject: "Your KKA Client Portal password was changed successfully",
      text,
    }),
  });

  if (!response.ok) return { sent: false, error: `Resend returned ${response.status}` };
  const data = await response.json().catch(() => ({}));
  return { sent: true, id: data.id ?? null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Missing authorization" }, 401);

    const service = serviceClient();
    const { data: authData, error: authError } = await service.auth.getUser(token);
    if (authError || !authData.user) return json({ error: "Invalid or expired session" }, 401);

    const password = String((await req.json()).password ?? "");
    if (password.length < 10 || password.length > 72) {
      return json({ error: "Password must be between 10 and 72 characters." }, 400);
    }

    const user = authData.user;
    const requestId = req.headers.get("X-KKA-Request-ID") || crypto.randomUUID();
    const audit = async (action: string, metadata: Record<string, unknown> = {}) => {
      try {
        const { data: membership } = await service.from("client_memberships").select("client_id").eq("user_id", user.id).limit(1).maybeSingle();
        await service.from("audit_logs").insert({
          actor_id: user.id, client_id: membership?.client_id ?? null, action,
          entity_type: "auth_user", entity_id: user.id,
          metadata: { request_id: requestId, ...metadata },
        });
      } catch (auditError) {
        console.error("[complete-initial-password] audit write failed", { requestId, error: auditError instanceof Error ? auditError.message : String(auditError) });
      }
    };
    console.info("[complete-initial-password] started", { requestId, userId: user.id, mustChange: user.app_metadata?.must_change_password === true });
    if (user.app_metadata?.must_change_password !== true) {
      await audit("initial_password_already_completed");
      return json({ ok: true, alreadyCompleted: true, requestId });
    }

    const { error } = await service.auth.admin.updateUserById(user.id, {
      password,
      app_metadata: { ...(user.app_metadata ?? {}), must_change_password: false },
    });
    if (error) {
      await audit("initial_password_change_failed", { stage: "auth_update", error: error.message || "Password could not be updated." });
      console.error("[complete-initial-password] auth update failed", { requestId, userId: user.id, error: error.message });
      return json({ error: error.message || "Password could not be updated.", requestId }, 400);
    }

    const { data: updatedUser, error: verifyError } = await service.auth.admin.getUserById(user.id);
    if (verifyError || !updatedUser.user || updatedUser.user.app_metadata?.must_change_password !== false) {
      const verificationError = verifyError?.message || "Account state verification failed after password update.";
      await audit("initial_password_change_failed", { stage: "post_update_verification", error: verificationError });
      console.error("[complete-initial-password] verification failed", { requestId, userId: user.id, error: verificationError });
      return json({ error: "Password update could not be verified. Please try again.", requestId }, 500);
    }

    const { data: profile } = await service.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
    const email = user.email ?? "";
    const fullName = profile?.full_name ?? user.user_metadata?.full_name ?? "Client";

    const emailResult = email
      ? await sendPasswordChangedEmail(email, fullName).catch((e) => ({ sent: false, error: e instanceof Error ? e.message : "Unknown email error" }))
      : { sent: false, error: "User email is unavailable" };

    await audit("initial_password_change_success", { email_sent: emailResult.sent === true });
    console.info("[complete-initial-password] completed", { requestId, userId: user.id, emailSent: emailResult.sent === true });
    return json({ ok: true, emailSent: emailResult.sent, emailId: emailResult.id ?? null, requestId });
  } catch (error) {
    const requestId = req.headers.get("X-KKA-Request-ID") || "unknown";
    console.error("[complete-initial-password] unhandled error", { requestId, error: error instanceof Error ? error.message : String(error) });
    return json({ error: error instanceof Error ? error.message : "Password update failed.", requestId }, 500);
  }
});