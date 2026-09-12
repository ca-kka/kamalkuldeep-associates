import { supabase } from "./supabase.js";

const clean = v => String(v ?? "").trim();
const upper = v => clean(v).toUpperCase() || null;
const emailOk = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const panOk = v => !v || /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v);
const tanOk = v => !v || /^[A-Z]{4}[0-9]{5}[A-Z]$/.test(v);
const cinOk = v => !v || /^[A-Z0-9]{21}$/.test(v);
const gstOk = v => !v || /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/.test(v);

export function showPortalAccessRequest(root, email = "", onBack = null) {
  root.innerHTML = `<section class="login-card access-request-card"><div class="brand login-brand"><span>KKA</span><small>CLIENT PLATFORM</small></div><p class="eyebrow">PORTAL ACCESS REQUEST</p><h1>Request access</h1><p class="muted">No active portal account was found for this email. Submit the form below and KKA will review the request.</p><form id="portal-access-request-form"><label>Full name<input name="full_name" type="text" maxlength="200" autocomplete="name" required></label><label>Email<input name="email" type="email" autocomplete="email" required></label><label>Mobile <span class="muted small">(optional)</span><input name="mobile" type="tel" maxlength="30" autocomplete="tel"></label><label>PAN <span class="muted small">(optional)</span><input name="pan" type="text" maxlength="10" autocomplete="off"></label><label>GSTIN <span class="muted small">(optional)</span><input name="gstin" type="text" maxlength="15" autocomplete="off"></label><label>TAN <span class="muted small">(optional)</span><input name="tan" type="text" maxlength="10" autocomplete="off"></label><label>CIN <span class="muted small">(optional)</span><input name="cin" type="text" maxlength="21" autocomplete="off"></label><label>Relationship with KKA<input name="relationship" type="text" maxlength="100" placeholder="Client / Director / Partner / Family member" required></label><label>Reason for requesting portal access<textarea name="reason" rows="3" maxlength="1000" required></textarea></label><label>Additional message <span class="muted small">(optional)</span><textarea name="message" rows="3" maxlength="2000"></textarea></label><button class="primary" type="submit">Submit access request</button></form><p id="portal-access-request-message" class="message" role="status"></p><button id="portal-access-request-back" class="secondary" type="button">Back to sign in</button></section>`;
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
    if (!clean(data.get("reason"))) { status.textContent = "Please provide a reason for requesting access."; return; }
    if (!panOk(pan) || !tanOk(tan) || !cinOk(cin) || !gstOk(gstin)) { status.textContent = "One or more identifiers has an invalid format."; return; }
    const payload = { email: emailValue, full_name: clean(data.get("full_name")), mobile: clean(data.get("mobile")) || null, pan, gstin, tan, cin, client_name: null, relationship: clean(data.get("relationship")), reason: clean(data.get("reason")), message: clean(data.get("message")) || null, status: "pending", reviewed_at: null, reviewed_by: null, rejection_reason: null, approved_client_id: null, email_sent_at: null, email_message_id: null };
    const { error } = await supabase.from("portal_access_requests").insert(payload);
    if (error) { status.textContent = "Unable to submit the request right now. Please try again later."; return; }
    form.reset();
    emailInput.value = emailValue;
    emailInput.readOnly = true;
    status.textContent = "Request submitted successfully. KKA will review the request and contact the applicant if access is approved.";
  });
}

window.KKAPortalAccessRequest = { show: showPortalAccessRequest };
