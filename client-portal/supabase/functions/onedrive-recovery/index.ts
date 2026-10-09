import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const url = Deno.env.get("SUPABASE_URL")!;
const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://portal.ca-kka.com",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const service = createClient(url, serviceRole, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });

async function staff(req: Request) {
  const h = req.headers
    .get("Authorization")
    ?.replace(/^Bearer\s+/i, "");

  if (!h) {
    throw new Error("Missing staff session");
  }

  const auth = createClient(url, anon, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data, error } = await auth.auth.getUser(h);

  if (error || !data.user) {
    throw new Error("Invalid or expired session");
  }

  const { data: p } = await service
    .from("profiles")
    .select("role,active")
    .eq("id", data.user.id)
    .maybeSingle();

  if (!p?.active || !["admin", "staff"].includes(p.role)) {
    throw new Error("Staff access required");
  }

  return {
    user: data.user,
    token: h,
  };
}

Deno.serve(async (req) => {
  // Browser CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return json(
      {
        error: "POST requests only",
      },
      405
    );
  }

  try {
    const { user, token } = await staff(req);

    const body = await req.json().catch(() => ({}));

    const oneDrive = `${url}/functions/v1/onedrive-storage`;

    let q = service
      .from("documents")
      .select(
        "id,client_id,original_filename,storage_path,area,financial_year,filing_period,status"
      )
      .eq("status", "accepted")
      .order("id");

    if (body.documentId) {
      q = q.eq("id", String(body.documentId));
    }

    const { data: docs, error } = await q.limit(200);

    if (error) {
      throw error;
    }

    const { data: connections, error: ce } = await service
      .from("storage_connections")
      .select("owner_user_id,drive_id")
      .eq("provider", "onedrive")
      .eq("status", "connected")
      .limit(2);

    if (ce) throw ce;
    if (!connections?.length) throw new Error("OneDrive is not connected.");
    if (connections.length !== 1) throw new Error("Multiple OneDrive connections found; administrator review is required.");
    const conn = connections[0];

    const results = [];

    for (const d of docs ?? []) {
      const { data: existing } = await service
        .from("onedrive_file_registry")
        .select("id,drive_item_id,web_url")
        .eq("owner_user_id", conn.owner_user_id)
        .eq("client_id", d.client_id)
        .eq("area", d.area)
        .eq("financial_year", d.financial_year)
        .eq("filing_period", d.filing_period)
        .eq("name", d.original_filename)
        .limit(1)
        .maybeSingle();

      if (existing) {
        results.push({
          documentId: d.id,
          status: "already_registered",
          driveItemId: existing.drive_item_id,
          webUrl: existing.web_url,
        });

        continue;
      }

      try {
        const r = await fetch(oneDrive, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            operation: "upload_from_supabase",
            storagePath: d.storage_path,
            filename: d.original_filename,
            clientId: d.client_id,
            area: d.area,
            financialYear: d.financial_year,
            filingPeriod: d.filing_period,
          }),
        });

        const b = await r.json().catch(() => ({}));

        if (!r.ok || !b.success) {
          throw new Error(
            b.error || `OneDrive transfer failed (${r.status})`
          );
        }

        results.push({
          documentId: d.id,
          status: "recovered",
          driveItemId: b.item?.id ?? null,
          webUrl: b.item?.webUrl ?? null,
        });
      } catch (e) {
        results.push({
          documentId: d.id,
          status: "failed",
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return json({
      success: true,
      scanned: docs?.length ?? 0,
      results,
    });
  } catch (e) {
    return json(
      {
        error: e instanceof Error ? e.message : String(e),
      },
      400
    );
  }
});