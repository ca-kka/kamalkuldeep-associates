import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { autoRefreshToken: true, persistSession: true },
});

let busy = false;

async function connectOneDrive(button) {
  if (busy) return;
  busy = true;
  button.disabled = true;
  button.textContent = "Connecting…";

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("The KKA session has expired. Please sign in again.");

    const { data, error } = await supabase.functions.invoke("onedrive-connect", {
      body: {},
    });

    if (error) throw new Error(error.message || "Unable to start the OneDrive connection.");
    if (!data?.authorizationUrl) {
      throw new Error(data?.error || data?.message || "Unable to start the OneDrive connection.");
    }

    window.location.assign(data.authorizationUrl);
  } catch (error) {
    console.error("KKA OneDrive connection error", error);
    alert(error instanceof Error ? error.message : "Unable to connect OneDrive.");
    button.disabled = false;
    button.textContent = "Connect OneDrive";
    busy = false;
  }
}

// Event delegation is intentional: app.js replaces dashboard HTML dynamically.
document.addEventListener("click", (event) => {
  const button = event.target instanceof Element
    ? event.target.closest("#connect-onedrive")
    : null;
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  connectOneDrive(button);
});

async function refreshButtonVisibility() {
  const button = document.querySelector("#connect-onedrive");
  if (!button) return;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    button.hidden = true;
    return;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role,active")
    .eq("id", user.id)
    .maybeSingle();

  button.hidden = !profile?.active || !["admin", "staff"].includes(profile.role);
}

const observer = new MutationObserver(() => {
  refreshButtonVisibility().catch((error) => {
    console.error("KKA OneDrive button visibility error", error);
  });
});

observer.observe(document.body, { childList: true, subtree: true });
refreshButtonVisibility().catch(() => {});
