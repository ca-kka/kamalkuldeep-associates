import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

function syncChoice(form) {
  if (!form) return;
  const toggle = form.querySelector("#link-existing");
  const area = form.querySelector("#client-link-area");
  const search = form.querySelector("#client-search");
  const selected = form.querySelector("#selected-client");
  const approve = form.querySelector("#approve-request");
  if (!toggle || !approve) return;

  if (!toggle.checked) {
    if (area) area.hidden = true;
    if (search) search.value = "";
    if (selected) {
      selected.hidden = true;
      selected.innerHTML = "";
    }
    approve.disabled = false;
    approve.textContent = "Create primary login";
    approve.title = "Create the portal login without linking it to an existing KKA client.";
  } else {
    if (area) area.hidden = false;
    const hasSelection = Boolean(selected && !selected.hidden && selected.textContent.trim());
    approve.disabled = !hasSelection;
    approve.textContent = "Approve & attach";
    approve.title = "Approve the request and attach the portal login to the selected KKA client.";
  }
}

async function approvePrimary(form) {
  const message = form.querySelector("#access-review-message");
  const approve = form.querySelector("#approve-request");
  const modal = form.closest(".modal-backdrop");
  const requestId = form.dataset.requestId;
  if (!requestId) throw new Error("Request id is missing. Please close and reopen this request.");

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("The session has expired. Please sign in again.");

  message.textContent = "Creating primary portal login…";
  approve.disabled = true;
  const response = await fetch(`${SUPABASE_URL}/functions/v1/manage-portal-access-request`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`
    },
    body: JSON.stringify({ action: "approve", requestId })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Unable to create the primary portal login.");
  modal?.remove();
  const notify = window.KKANotify;
  if (data.emailSent) {
    notify?.success?.("Request approved and the primary login was created. The welcome email was sent.");
  } else {
    notify?.error?.("Request approved and the primary login was created, but the welcome email could not be sent.");
  }
  window.KKAPortalAccessAdmin?.render?.();
}

document.addEventListener("change", event => {
  const toggle = event.target.closest?.("#link-existing");
  if (!toggle) return;
  const form = toggle.closest("#approve-request-form");
  if (form) syncChoice(form);
});

document.addEventListener("submit", event => {
  const form = event.target.closest?.("#approve-request-form");
  if (!form) return;
  const toggle = form.querySelector("#link-existing");
  if (!toggle || toggle.checked) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  approvePrimary(form).catch(error => {
    const message = form.querySelector("#access-review-message");
    const approve = form.querySelector("#approve-request");
    if (message) message.textContent = error.message || "Unable to create the primary portal login.";
    if (approve) approve.disabled = false;
    window.KKANotify?.error?.(error);
  });
}, true);

document.addEventListener("click", event => {
  const reviewButton = event.target.closest?.("[data-access-review]");
  if (!reviewButton) return;
  setTimeout(() => {
    const form = document.querySelector("#approve-request-form");
    if (!form) return;
    form.dataset.requestId = reviewButton.dataset.accessReview || "";
    syncChoice(form);
  }, 0);
});
