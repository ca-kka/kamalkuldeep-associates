import { createClient as createSupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";
const supabase = createSupabaseClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const clean = v => String(v ?? "").trim();
const upper = v => clean(v).toUpperCase() || null;
const emailOk = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const panOk = v => !v || /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v);
const tanOk = v => !v || /^[A-Z]{4}[0-9]{5}[A-Z]$/.test(v);
const cinOk = v => !v || /^[A-Z0-9]{21}$/.test(v);
const gstOk = v => !v || /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/.test(v);

export function showPortalAccessRequest(root, email = "", onBack = null) {
  root.innerHTML = `<main class="access-request-shell"><section class="login-card access-request-card"><div class="brand login-brand"><span>KKA</span><small>CLIENT PLATFORM</small></div><p class="eyebrow">PORTAL ACCESS REQUEST</p><h1>Request access</h1><p class="muted">No active portal account was found for this email. Submit the form below and KKA will review the request.</p><form id="portal-access-request-form"><label>Full name<input name="full_name" type="text" maxlength="200" autocomplete="name" required></label><label>Email<input name="email" type="email" autocomplete="email" required></label><label>Mobile<input name="mobile" type="tel" maxlength="30" autocomplete="tel"></label><label>PAN<input name="pan" type="text" maxlength="10" autocomplete="off"></label><label>GSTIN<input name="gstin" type="text" maxlength="15" autocomplete="off"></label><label>TAN<input name="tan" type="text" maxlength="10" autocomplete="off"></label><label>CIN<input name="cin" type="text" maxlength="21" autocomplete="off"></label><label>Relationship with KKA<input name="relationship" type="text" maxlength="100" placeholder="Client / Director / Partner / Family member" required></label><label>Reason for requesting portal access<textarea name="reason" rows="3" maxlength="1000" required></textarea></label><label>Additional message<textarea name="message" rows="3" maxlength="2000"></textarea></label><label class="legal-consent"><input name="privacy_ack" type="checkbox" required><span>I confirm that the information provided is accurate and acknowledge the <a href="privacy.html" target="_blank" rel="noopener noreferrer">KKA Privacy &amp; Data Protection Notice</a>.</span></label><button class="primary" type="submit">Submit access request</button></form><p id="portal-access-request-message" class="message" role="status"></p><button id="portal-access-request-back" class="secondary" type="button">Back to sign in</button></section><aside class="access-request-visual" aria-label="KKA Client Portal"><img src="portal%20image.png?v=20260913-3" alt="KKA Client Portal secure document workspace" loading="eager" decoding="async" onerror="this.closest('.access-request-visual').classList.add('image-load-error')"></aside></main>`;
  const form = root.querySelector("#portal-access-request-form");
  const emailInput = form.querySelector('[name="email"]');
  const status = root.querySelector("#portal-access-request-message");
  emailInput.value = clean(email).toLowerCase();
  if (emailInput.value) emailInput.readOnly = true;
  root.querySelector("#portal-access-request-back").onclick = () => typeof onBack === "function" && onBack();

  form.addEventListener("submit", async event => {
    event.preventDefault();
    status.textContent = "Submitting request…";
    const data = new FormData(form);
    const emailValue = clean(data.get("email")).toLowerCase();
    const pan = upper(data.get("pan")), tan = upper(data.get("tan")), cin = upper(data.get("cin")), gstin = upper(data.get("gstin"));
    if (!emailOk(emailValue)) { status.textContent = "Enter a valid email address."; return; }
    if (!clean(data.get("full_name"))) { status.textContent = "Please enter your full name."; return; }
    if (!clean(data.get("relationship"))) { status.textContent = "Please enter the relationship with KKA."; return; }
    if (!clean(data.get("reason"))) { status.textContent = "Please provide a reason for requesting access."; return; }
    if (!data.get("privacy_ack")) { status.textContent = "Please acknowledge the Privacy & Data Protection Notice."; return; }
    if (!panOk(pan) || !tanOk(tan) || !cinOk(cin) || !gstOk(gstin)) { status.textContent = "One or more identifiers has an invalid format."; return; }

    const { data: requestId, error } = await supabase.rpc("submit_portal_access_request", {
      p_email: emailValue,
      p_full_name: clean(data.get("full_name")),
      p_mobile: clean(data.get("mobile")) || null,
      p_pan: pan,
      p_gstin: gstin,
      p_tan: tan,
      p_cin: cin,
      p_client_name: null,
      p_relationship: clean(data.get("relationship")),
      p_reason: clean(data.get("reason")),
      p_message: clean(data.get("message")) || null
    });
    if (error) { status.textContent = error.message || "Unable to submit the request right now. Please try again later."; return; }
    form.reset();
    emailInput.value = emailValue;
    emailInput.readOnly = true;
    status.textContent = requestId ? "Request submitted successfully. KKA will review the request and contact the applicant if access is approved." : "Request received successfully. KKA will review the request.";
  });
}

const accessRoot = () => document.querySelector("#app");

document.addEventListener("click", event => {
  const button = event.target.closest("#request-access-button");
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  const root = accessRoot();
  if (!root) return;
  const email = document.querySelector("#email")?.value || "";
  showPortalAccessRequest(root, email, () => location.reload());
}, true);

window.KKAPortalAccessRequest = { show: showPortalAccessRequest };