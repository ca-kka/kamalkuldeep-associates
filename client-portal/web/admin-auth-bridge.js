import { createClient as createSupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";
import { hasActivePortalTab, registerPortalTab } from "./portal-tab-session.js?v=20261009-multitab1";

const supabase = createSupabaseClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const MARKER = "kka-tab-session:admin";
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const featureModules = [
  "./diagnostic-logger.js?v=20261009-errors3",
  "./theme.js?v=20261004-issues29b",
  "./operation-feedback.js?v=20261004-issues29b",
  "./session-route-transition.js?v=20261004-issues29b",
  "./session-security.js?v=20261009-multitab1",
  "./session-settings.js?v=20261004-issues29b",
  "./dashboard-live.js?v=20261004-issues29b",
  "./portal-access-admin.js?v=20261004-issues29b",
  "./staff-access.js?v=20261004-issues29b",
  "./storage-view.js?v=20261004-issues29b",
  "./storage-monitor.js?v=20261004-issues29b",
  "./document-uploader.js?v=20261008-docs4",
  "./filing-structure-uploader.js?v=20261008-filing-period1",
  "./documents-browser.js?v=20261008-docs3",
  "./onedrive-directory.js?v=20261009-portalpatch1",
  "./pan-assessment.js?v=20261004-issues29b",
  "./review-queue.js?v=20261004-issues29b",
  "./ui-search-lite.js?v=20261004-issues29b",
  "./manual-client-search.js?v=20261004-issues29b",
  "./audit-trail.js?v=20261004-issues29b",
  "./client-access-status.js?v=20261004-issues29b",
  "./filing-structure-admin.js?v=20261004-issues29b",
  "./mobile-menu.js?v=20261004-issues29b",
  "./admin-portal-feedback.js?v=20261004-issues29b",
  "./admin/family-client-bridge.js?v=20261004-issues29b",
  "./admin/client-creation.js?v=20261004-issues29b",
  "./app.js?v=20261008-live-directory1"
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
      .select("role,active")
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

function hasLoginTabMarker() {
  try { return Boolean(sessionStorage.getItem(MARKER)); } catch { return false; }
}

async function rejectUnownedSession() {
  try { sessionStorage.setItem("kka-logout-reason", "browser-closed"); } catch {}
  await supabase.auth.signOut({ scope: "local" }).catch(() => {});
  return root();
}

async function boot() {
  try {
    const session = await stableSession();
    if (!session?.user) return root();

    const profile = await getProfile(session.user.id);
    if (!profile?.active) {
      await supabase.auth.signOut({ scope: "local" }).catch(() => {});
      return root();
    }

    if (profile.role !== "admin" && profile.role !== "staff") {
      window.location.replace("../client/");
      return;
    }

    if (!hasLoginTabMarker() && !hasActivePortalTab("admin")) return rejectUnownedSession();
    registerPortalTab("admin", { updateMarker: !hasLoginTabMarker() });

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
