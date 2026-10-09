import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PORTAL_ORIGIN =
  Deno.env.get("PORTAL_ALLOWED_ORIGIN") ?? "https://portal.ca-kka.com";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CLIENT_ID = Deno.env.get("MICROSOFT_ONEDRIVE_CLIENT_ID");
const CLIENT_SECRET = Deno.env.get("MICROSOFT_ONEDRIVE_CLIENT_SECRET");
const STATE_KEY = Deno.env.get("MICROSOFT_ONEDRIVE_TOKEN_ENCRYPTION_KEY");

const REDIRECT_URI =
  `${SUPABASE_URL}/functions/v1/onedrive-oauth-callback`;

const cors = {
  "Access-Control-Allow-Origin": PORTAL_ORIGIN,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromB64url(value: string): Uint8Array<ArrayBuffer> {
  const padded =
    value.replace(/-/g, "+").replace(/_/g, "/") +
    "=".repeat((4 - (value.length % 4)) % 4);

  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

function utf8(value: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(new TextEncoder().encode(value));
}

async function hmacSign(payload: string, key: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    utf8(key),
    {
      name: "HMAC",
      hash: "SHA-256",
    },
    false,
    ["sign"],
  );

  return b64url(
    new Uint8Array(
      await crypto.subtle.sign(
        "HMAC",
        cryptoKey,
        utf8(payload),
      ),
    ),
  );
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let result = 0;

  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

async function verifyState(
  state: string,
  key: string,
): Promise<{ sub: string } | null> {
  const parts = state.split(".");

  if (parts.length !== 2) return null;

  const [payload, signature] = parts;

  const expected = await hmacSign(payload, key);

  if (!safeEqual(signature, expected)) return null;

  let parsed: { sub?: string; exp?: number };

  try {
    parsed = JSON.parse(
      new TextDecoder().decode(fromB64url(payload)),
    );
  } catch {
    return null;
  }

  if (!parsed.sub || !parsed.exp) return null;

  if (parsed.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }

  return {
    sub: parsed.sub,
  };
}

async function deriveEncryptionKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    utf8(secret),
  );

  return crypto.subtle.importKey(
    "raw",
    digest,
    {
      name: "AES-GCM",
    },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encryptCredential(
  value: unknown,
  secret: string,
): Promise<{ blob: string; iv: string }> {
  const key = await deriveEncryptionKey(secret);

  const iv = crypto.getRandomValues(new Uint8Array(12));

  const plaintext = utf8(JSON.stringify(value));

  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv,
      },
      key,
      plaintext,
    ),
  );

  return {
    blob: b64url(ciphertext),
    iv: b64url(iv),
  };
}

function html(title: string, message: string, success = false) {
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message);

  return new Response(
    `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${safeTitle}</title>
<style>
body{
  margin:0;
  min-height:100vh;
  display:grid;
  place-items:center;
  background:#f4f7f5;
  font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
}
.card{
  width:min(520px,calc(100% - 40px));
  box-sizing:border-box;
  background:white;
  border:1px solid #dce5df;
  border-radius:18px;
  padding:32px;
  box-shadow:0 18px 50px rgba(20,50,35,.10);
}
h1{margin:0 0 12px;font-size:24px;color:#18352a}
p{color:#53635b;line-height:1.6}
.badge{
  display:inline-block;
  padding:6px 10px;
  border-radius:999px;
  background:${success ? "#e6f4eb" : "#fbe9e9"};
  color:${success ? "#24623d" : "#9a2e2e"};
  font-weight:700;
  font-size:13px;
}
button{
  margin-top:18px;
  padding:11px 16px;
  border:0;
  border-radius:10px;
  background:#18352a;
  color:white;
  cursor:pointer;
}
</style>
</head>
<body>
<section class="card">
<span class="badge">${success ? "Connected" : "Connection error"}</span>
<h1>${safeTitle}</h1>
<p>${safeMessage}</p>
<button onclick="window.close()">Close window</button>
</section>
</body>
</html>`,
    {
      status: success ? 200 : 400,
      headers: {
        ...cors,
        "Content-Type": "text/html; charset=utf-8",
      },
    },
  );
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c] ?? c,
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    if (!CLIENT_ID || !CLIENT_SECRET || !STATE_KEY) {
      return html(
        "OneDrive configuration incomplete",
        "The Microsoft OneDrive connection is not fully configured in Supabase.",
      );
    }

    const url = new URL(req.url);

    const microsoftError = url.searchParams.get("error");
    const microsoftErrorDescription =
      url.searchParams.get("error_description");

    if (microsoftError) {
      return html(
        "Microsoft authorization was not completed",
        microsoftErrorDescription || microsoftError,
      );
    }

    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");

    if (!code || !state) {
      return html(
        "Invalid OneDrive callback",
        "The Microsoft authorization response was incomplete. Please return to KKA and try again.",
      );
    }

    const stateData = await verifyState(state, STATE_KEY);

    if (!stateData) {
      return html(
        "Authorization expired",
        "The OneDrive authorization request is invalid or has expired. Please start the connection again from KKA.",
      );
    }

    const tokenResponse = await fetch(
      "https://login.microsoftonline.com/consumers/oauth2/v2.0/token",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body: new URLSearchParams({
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          code,
          redirect_uri: REDIRECT_URI,
          grant_type: "authorization_code",
          scope:
            "openid profile offline_access User.Read Files.ReadWrite",
        }),
      },
    );

    const tokenBody = await tokenResponse.json().catch(() => ({}));

    if (!tokenResponse.ok || !tokenBody.access_token) {
      console.error("Microsoft token exchange failed", {
        status: tokenResponse.status,
        error: tokenBody.error,
      });

      return html(
        "Microsoft connection failed",
        "Microsoft did not return a usable authorization token. Please try connecting OneDrive again.",
      );
    }

    const accessToken = String(tokenBody.access_token);
    const refreshToken = tokenBody.refresh_token
      ? String(tokenBody.refresh_token)
      : null;

    if (!refreshToken) {
      return html(
        "OneDrive connection incomplete",
        "Microsoft did not return a refresh token. Please make sure offline access is enabled and try again.",
      );
    }

    const graphHeaders = {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    };

    const meResponse = await fetch(
      "https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName",
      {
        headers: graphHeaders,
      },
    );

    if (!meResponse.ok) {
      console.error("Microsoft Graph /me failed", {
        status: meResponse.status,
      });

      return html(
        "Unable to verify Microsoft account",
        "Microsoft authorization succeeded, but KKA could not verify the connected account.",
      );
    }

    const me = await meResponse.json();

    const driveResponse = await fetch(
      "https://graph.microsoft.com/v1.0/me/drive?$select=id,driveType,owner",
      {
        headers: graphHeaders,
      },
    );

    if (!driveResponse.ok) {
      console.error("Microsoft Graph /drive failed", {
        status: driveResponse.status,
      });

      return html(
        "Unable to access OneDrive",
        "Microsoft authorization succeeded, but the connected account did not return a usable OneDrive drive.",
      );
    }

    const drive = await driveResponse.json();

    const credential = {
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: tokenBody.token_type ?? "Bearer",
      expires_in: tokenBody.expires_in ?? null,
      obtained_at: new Date().toISOString(),
    };

    const encrypted = await encryptCredential(
      credential,
      STATE_KEY,
    );

    const service = createClient(
      SUPABASE_URL,
      SERVICE_ROLE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );

    const providerUserId =
      String(me.id || "");

    const providerEmail =
      String(
        me.mail ||
        me.userPrincipalName ||
        "",
      );

    const driveId =
      String(drive.id || "");

    const { data: existing, error: lookupError } =
      await service
        .from("storage_connections")
        .select("id")
        .eq("owner_user_id", stateData.sub)
        .eq("provider", "onedrive")
        .maybeSingle();

    if (lookupError) {
      console.error("Storage connection lookup failed", lookupError);

      return html(
        "Connection could not be saved",
        "The Microsoft account was verified, but KKA could not save the connection.",
      );
    }

    const connectionData = {
      owner_user_id: stateData.sub,
      provider: "onedrive",
      provider_user_id: providerUserId,
      provider_email: providerEmail,
      drive_id: driveId,
      credential_blob: encrypted.blob,
      credential_iv: encrypted.iv,
      last_verified_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      status: "connected",
      scope:
        "openid profile offline_access User.Read Files.ReadWrite",
    };

    let saveError = null;

    if (existing?.id) {
      const result = await service
        .from("storage_connections")
        .update(connectionData)
        .eq("id", existing.id);

      saveError = result.error;
    } else {
      const result = await service
        .from("storage_connections")
        .insert({
          ...connectionData,
          created_at: new Date().toISOString(),
        });

      saveError = result.error;
    }

    if (saveError) {
      console.error("Storage connection save failed", saveError);

      return html(
        "Connection could not be saved",
        "Microsoft authorization succeeded, but KKA could not save the OneDrive connection.",
      );
    }

    return html(
      "OneDrive connected successfully",
      `The KKA portal is now connected to the Microsoft OneDrive account${providerEmail ? ` (${providerEmail})` : ""}. You can close this window and return to KKA.`,
      true,
    );
  } catch (error) {
    console.error("OneDrive OAuth callback error", error);

    return html(
      "OneDrive connection failed",
      "An unexpected error occurred while completing the OneDrive connection. Please try again from KKA.",
    );
  }
});