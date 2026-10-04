import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const root = document.querySelector("#app");
let mounted = false;
let navigationBound = false;

function requestedView() {
  const view = (location.hash || "#overview").slice(1).split("?")[0].toLowerCase();
  return ["overview", "documents", "upload", "session-settings"].includes(view) ? view : "overview";
}

async function openView(view) {
  const allowed = ["overview", "documents", "upload", "session-settings"].includes(view) ? view : "overview";
  if (allowed !== "documents") await window.KKAFamilyDocumentsStop?.();
  document.querySelectorAll(".sidebar nav a[data-view]").forEach(link => link.classList.toggle("active", link.dataset.view === (allowed === "overview" ? "dashboard" : allowed)));
  let result;
  if (allowed === "overview") result = await window.KKAClientDashboardRender?.();
  else if (allowed === "documents") result = await window.KKAFamilyDocumentsRender?.();
  else if (allowed === "upload") result = await window.KKAClientUploadRender?.();
  else if (allowed === "session-settings") result = await window.KKASessionSettings?.open?.();
  try { await window.KKAMountClientProfileMenu?.(); } catch (error) { console.warn("Client profile menu could not be mounted", error); }
  return result;
}

function bindNavigation() {
  if (navigationBound) return;
  navigationBound = true;
  document.addEventListener("click", event => {
    const link = event.target.closest?.(".sidebar nav a[data-view]");
    if (!link) return;
    event.preventDefault();
    const view = link.dataset.view === "dashboard" ? "overview" : link.dataset.view;
    if (location.hash !== `#${view}`) location.hash = view;
    else void openView(view);
  });
  window.addEventListener("hashchange", () => void openView(requestedView()));
}

async function mountClientShell() {
  if (mounted || !root) return;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return;
  const template = document.querySelector("#portal-template");
  if (!template) return;
  mounted = true;
  root.replaceChildren(template.content.cloneNode(true));
  bindNavigation();
  // Establish the signed-in user's selected profile before honoring a deep link
  // to Documents or Upload; both views use the same persistent profile key.
  try {
    await window.KKAClientDashboardRender?.();
    await window.KKAMountClientProfileMenu?.();
  } catch (error) {
    console.warn("Client profile context could not be initialized", error);
  }
  await openView(requestedView());
}

window.addEventListener("kka:client-ready", () => void mountClientShell(), { once: true });
