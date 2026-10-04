import { createClient as createSupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

const supabase = createSupabaseClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const MARKER = "kka-tab-session:admin";
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const featureModules = [
  "./diagnostic-logger.js?v=20261004-bootstrap1",
  "./theme.js?v=20261004-bootstrap1",
  "./operation-feedback.js?v=20261004-bootstrap1",
  "./session-route-transition.js?v=20261004-bootstrap1",
  "./session-security.js?v=20261004-bootstrap1",
  "./session-settings.js?v=20261004-bootstrap1",
  "./dashboard-live.js?v=20261004-bootstrap1",
  "./portal-access-request.js?v=20261004-bootstrap1",
  "./portal-access-admin.js?v=20261004-bootstrap1",
  "./staff-access.js?v=20261004-bootstrap1",
  "./storage-view.js?v=20261004-bootstrap1",
  "./storage-monitor.js?v=20261004-bootstrap1",
  "./document-uploader.js?v=20261004-bootstrap1",
  "./filing-structure-uploader.js?v=20261004-bootstrap1",
  "./documents-browser.js?v=20261004-bootstrap1",
  "./onedrive-directory.js?v=20261004-bootstrap1",
  "./pan-assessment.js?v=20261004-bootstrap1",
  "./review-queue.js?v=20261004-bootstrap1",
  "./ui-search-lite.js?v=20261004-bootstrap1",
  "./manual-client-search.js?v=20261004-bootstrap1",
  "./audit-trail.js?v=20261004-bootstrap1",
  "./client-access-status.js?v=20261004-bootstrap1",
  "./filing-structure-admin.js?v=20261004-bootstrap1",
  "./nav-bridge.js?v=20261004-bootstrap1",
  "./mobile-menu.js?v=20261004-bootstrap1",
  "./admin-portal-feedback.js?v=20261004-bootstrap1",
  "./app.js?v=20261004-bootstrap1",
  "./admin-hash-router.js?v=20261004-bootstrap1",
  "./admin/family-client-bridge.js?v=20261004-bootstrap1",
  "./admin/client-creation.js?v=20261004-bootstrap1"
];

async function stableSession() {
  for (let i = 0; i < 4; i += 1) {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) return session;
    if (i < 3) await sleep(250);
  }
  return null;
}

async function getProfile(id) {
  for (let i = 0; i < 3; i += 1) {
    const { data, error } = await supabase
      .from("profiles")
      .select("role,active,is_active")
      .eq("id", id)
      .maybeSingle();
    if (!error && data) return data;
    if (i < 2) await sleep(250);
  }
  return null;
}

async function loadFeatureModule(path) {
  try {
    await import(path);
    return true;
  } catch (error) {
    // A non-critical feature must never take down the authenticated admin shell.
    console.error(`[KKA Admin] Optional module failed: ${path}`, error);
    try {
      window.KKALog?.error?.("admin_feature_boot", "Optional admin module failed", {
        module: path,
        message: error?.message || String(error)
      });
    } catch {}
    return false;
  }
}

async function root() {
  try { sessionStorage.removeItem(MARKER); } catch {}
  window.location.replace("../");
}

async function boot() {
  try {
    const session = await stableSession();
    if (!session?.user) return root();

    const profile = await getProfile(session.user.id);
    const active = profile?.active ?? profile?.is_active;
    if (!active) {
      await supabase.auth.signOut({ scope: "local" }).catch(() => {});
      return root();
    }

    if (profile.role !== "admin" && profile.role !== "staff") {
      window.location.replace("../client/");
      return;
    }

    try {
      sessionStorage.setItem(MARKER, String(Date.now()));
      sessionStorage.setItem("kka-auth-handoff", "admin");
    } catch {}

    // Preserve the established module order. Each feature is isolated so a single
    // broken/temporarily unavailable module cannot break the entire admin portal.
    for (const path of featureModules) {
      await loadFeatureModule(path);
    }

    window.dispatchEvent(new CustomEvent("kka:admin-ready", {
      detail: { userId: session.user.id, role: profile.role }
    }));
  } catch (error) {
    console.error("[KKA auth bridge] Admin critical bootstrap failed", error);
    try {
      window.KKALog?.error?.("auth_bridge_boot", "Admin portal critical bootstrap failed", {
        message: error?.message || String(error)
      });
    } catch {}
    await root();
  }
}

void boot();
