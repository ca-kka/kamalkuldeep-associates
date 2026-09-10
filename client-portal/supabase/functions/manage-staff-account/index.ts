import { corsHeaders, json, serviceClient } from "../_shared/portal.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const allowedRoles = new Set(["admin", "staff"]);

async function requireAdmin(req: Request) {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Missing administrator session");

  const auth = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: { user }, error } = await auth.auth.getUser(token);
  if (error || !user) throw new Error("Invalid or expired session");

  const service = serviceClient();
  const { data: profile } = await service
    .from("profiles")
    .select("id, role, active, full_name")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.active || profile.role !== "admin") {
    throw new Error("Administrator access required");
  }

  return { user, service };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { user, service } = await requireAdmin(req);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "list");

    if (action === "list") {
      const { data, error } = await service
        .from("profiles")
        .select("id, full_name, role, active, created_at, updated_at")
        .in("role", ["admin", "staff"])
        .order("role", { ascending: true })
        .order("full_name", { ascending: true });
      if (error) throw error;
      return json({ profiles: data ?? [] });
    }

    if (action === "update") {
      const profileId = String(body.profileId ?? "");
      const role = String(body.role ?? "");
      const active = body.active;

      if (!profileId) return json({ error: "Profile ID is required" }, 400);
      if (!allowedRoles.has(role)) return json({ error: "Role must be admin or staff" }, 400);
      if (typeof active !== "boolean") return json({ error: "Active must be true or false" }, 400);

      if (profileId === user.id && (role !== "admin" || active !== true)) {
        return json({ error: "The signed-in administrator cannot remove or disable their own administrator access" }, 400);
      }

      const { data: target, error: targetError } = await service
        .from("profiles")
        .select("id, role, active, full_name")
        .eq("id", profileId)
        .maybeSingle();
      if (targetError) throw targetError;
      if (!target || !["admin", "staff"].includes(target.role)) {
        return json({ error: "Staff profile not found" }, 404);
      }

      if (target.role === "admin" && (role !== "admin" || active !== true)) {
        const { count, error: countError } = await service
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("role", "admin")
          .eq("active", true);
        if (countError) throw countError;
        if ((count ?? 0) <= 1) {
          return json({ error: "At least one active administrator must remain" }, 400);
        }
      }

      const { data: updated, error: updateError } = await service
        .from("profiles")
        .update({ role, active, updated_at: new Date().toISOString() })
        .eq("id", profileId)
        .select("id, full_name, role, active, created_at, updated_at")
        .single();
      if (updateError) throw updateError;

      await service.from("audit_logs").insert({
        actor_id: user.id,
        action: "staff_profile_updated",
        client_id: null,
        metadata: {
          profile_id: profileId,
          previous_role: target.role,
          previous_active: target.active,
          role,
          active,
        },
      });

      return json({ profile: updated });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : "Staff management failed" }, 400);
  }
});
