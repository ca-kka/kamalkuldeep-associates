import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { autoRefreshToken: true, persistSession: true },
});

async function setupOneDriveButton() {
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

  if (!profile?.active || !["admin", "staff"].includes(profile.role)) {
    button.hidden = true;
    return;
  }

  button.hidden = false;
  button.addEventListener("click", async () => {
    if (button.disabled) return;

    button.disabled = true;
    button.textContent = "Connecting…";

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error("The KKA session has expired. Please sign in again.");
      }

      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/onedrive-connect`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: "{}",
        },
      );

      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.authorizationUrl) {
        throw new Error(
          result.error ||
          result.message ||
          "Unable to start the OneDrive connection.",
        );
      }

      window.location.assign(result.authorizationUrl);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Unable to connect OneDrive.");
      button.disabled = false;
      button.textContent = "Connect OneDrive";
    }
  });
}

const observer = new MutationObserver(() => {
  const button = document.querySelector("#connect-onedrive");
  if (!button || button.dataset.onedriveReady === "true") return;
  button.dataset.onedriveReady = "true";
  setupOneDriveButton();
});

observer.observe(document.body, { childList: true, subtree: true });
setupOneDriveButton();
