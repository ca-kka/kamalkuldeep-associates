import { createClient as createSupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

const supabase = createSupabaseClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const esc = v => String(v ?? "").replace(/[&<>'"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" }[c]));
const fmtDate = v => v ? new Date(v).toLocaleString([], { dateStyle:"medium", timeStyle:"short" }) : "—";

async function call(action, payload = {}) {
  const { data:{ session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("The session has expired. Please sign in again.");
  const response = await fetch(`${SUPABASE_URL}/functions/v1/manage-portal-access-request`, {
    method:"POST",
    headers:{ "Content-Type":"application/json", Authorization:`Bearer ${session.access_token}` },
    body:JSON.stringify({ action, ...payload })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Access request action failed.");
  return result;
}

function modal(inner) {
  const el = document.createElement("div");
  el.className = "modal-backdrop";
  el.innerHTML = inner;
  document.body.appendChild(el);
  el.querySelectorAll(".modal-close").forEach(b => b.addEventListener("click", () => el.remove()));
  return el;
}

async function showReview(request) {
  let clients = [];
  try {
    const { data, error } = await supabase.from("clients").select("id,legal_name,display_name,pan,gstin,active").eq("active", true).order("legal_name");
    if (error) throw error;
    clients = data ?? [];
  } catch (error) {
    alert(error.message || "Unable to load active clients.");
    return;
  }

  const el = modal(`<section class="modal" role="dialog" aria-modal="true"><div class="modal-head"><div><p class="eyebrow">PORTAL ACCESS REQUEST</p><h2>Review request</h2><p class="muted">Submitted ${esc(fmtDate(request.created_at))}</p></div><button class="modal-close" type="button">×</button></div><div class="profile-details"><div><span>Applicant</span><strong>${esc(request.full_name)}</strong></div><div><span>Email</span><strong>${esc(request.email)}</strong></div><div><span>Mobile</span><strong>${esc(request.mobile || "—")}</strong></div><div><span>Relationship</span><strong>${esc(request.relationship || "—")}</strong></div><div><span>PAN</span><strong>${esc(request.pan || "—")}</strong></div><div><span>GSTIN</span><strong>${esc(request.gstin || "—")}</strong></div><div><span>TAN</span><strong>${esc(request.tan || "—")}</strong></div><div><span>CIN</span><strong>${esc(request.cin || "—")}</strong></div></div><div class="panel" style="margin-top:16px"><p class="eyebrow">REQUEST DETAILS</p><p><strong>Reason</strong><br>${esc(request.reason || "—")}</p>${request.message ? `<p style="margin-top:12px"><strong>Message</strong><br>${esc(request.message)}</p>` : ""}</div><form id="approve-request-form" class="form-grid" style="margin-top:16px"><label class="full">Approve for KKA client<select name="clientId" required><option value="">Select active client…</option>${clients.map(c => `<option value="${esc(c.id)}">${esc(c.display_name || c.legal_name)}${c.pan ? ` · ${esc(c.pan)}` : ""}</option>`).join("")}</select><small>The applicant's portal login will be linked to this existing KKA client.</small></label><div class="form-message full" id="access-review-message"></div><div class="modal-actions full"><button type="button" class="secondary modal-close">Cancel</button><button type="button" class="secondary" id="reject-request">Reject</button><button type="submit" class="primary">Approve request</button></div></form></section>`);

  el.querySelector("#approve-request-form").addEventListener("submit", async event => {
    event.preventDefault();
    const message = el.querySelector("#access-review-message");
    const clientId = new FormData(event.currentTarget).get("clientId");
    if (!clientId) return;
    message.textContent = "Approving request…";
    try {
      const result = await call("approve", { requestId:request.id, clientId:String(clientId) });
      el.remove();
      alert(result.emailSent ? "Request approved and the welcome email was sent." : "Request approved. The account was created, but the welcome email could not be sent.");
      await render();
    } catch (error) { message.textContent = error.message; }
  });

  el.querySelector("#reject-request").addEventListener("click", async () => {
    const reason = prompt("Reason for rejection (optional):", "") ?? "";
    const message = el.querySelector("#access-review-message");
    message.textContent = "Rejecting request…";
    try { await call("reject", { requestId:request.id, rejectionReason:reason }); el.remove(); await render(); }
    catch (error) { message.textContent = error.message; }
  });
}

async function render() {
  const root = document.querySelector(".portal-main");
  if (!root) return;
  const { data:{ user } } = await supabase.auth.getUser();
  if (!user) return;
  const { data:profile } = await supabase.from("profiles").select("role,active").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin" || !profile.active) {
    root.innerHTML = `<section class="panel"><p class="eyebrow">ACCESS CONTROL</p><h2>Administrator access required</h2><p class="muted">Only an administrator can review portal access requests.</p></section>`;
    return;
  }
  root.innerHTML = `<header><div><p class="eyebrow">ACCESS MANAGEMENT</p><h1>Portal Access Requests</h1><p class="muted">Review applications submitted from the KKA Client Platform sign-in screen.</p></div><div class="page-actions"><button class="secondary" id="access-refresh">Refresh</button></div></header><section class="stats" id="access-stats"></section><section class="panel"><div class="panel-head"><div><p class="eyebrow">APPLICATION QUEUE</p><h2>Client access applications</h2><p class="muted">Approve an applicant against an existing KKA client or reject the request.</p></div></div><div class="table-wrap"><table><thead><tr><th>Applicant</th><th>Email</th><th>Relationship</th><th>Submitted</th><th>Status</th><th>Action</th></tr></thead><tbody id="access-request-rows"><tr><td colspan="6">Loading…</td></tr></tbody></table></div></section>`;

  const rows = root.querySelector("#access-request-rows");
  try {
    const requests = (await call("list")).requests ?? [];
    const pending = requests.filter(r => r.status === "pending").length;
    const approved = requests.filter(r => r.status === "approved").length;
    const rejected = requests.filter(r => r.status === "rejected").length;
    root.querySelector("#access-stats").innerHTML = [["Pending",pending,"Awaiting administrator review"],["Approved",approved,"Portal access granted"],["Rejected",rejected,"Requests declined"]].map(([l,v,n]) => `<article><p>${l}</p><strong>${v}</strong><span class="muted">${n}</span></article>`).join("");
    rows.innerHTML = requests.length ? requests.map(r => `<tr><td><strong>${esc(r.full_name || "Unnamed")}</strong>${r.client_name ? `<small>${esc(r.client_name)}</small>` : ""}</td><td>${esc(r.email)}</td><td>${esc(r.relationship || "—")}</td><td>${esc(fmtDate(r.created_at))}</td><td><span class="pill ${r.status === "approved" ? "success" : "neutral"}">${esc(r.status)}</span>${r.rejection_reason ? `<small>${esc(r.rejection_reason)}</small>` : ""}</td><td>${r.status === "pending" ? `<button class="primary compact" data-access-review="${esc(r.id)}">Review</button>` : `<span class="muted small">Reviewed ${esc(fmtDate(r.reviewed_at))}</span>`}</td></tr>`).join("") : `<tr><td colspan="6">No portal access requests have been submitted.</td></tr>`;
    rows.querySelectorAll("[data-access-review]").forEach(button => button.addEventListener("click", () => { const request = requests.find(r => r.id === button.dataset.accessReview); if (request) showReview(request); }));
  } catch (error) {
    rows.innerHTML = `<tr><td colspan="6">${esc(error.message)}</td></tr>`;
  }
  root.querySelector("#access-refresh").addEventListener("click", render);
}

document.addEventListener("click", event => {
  const link = event.target.closest?.('a[data-view="access-requests"]');
  if (!link) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  render();
}, true);

window.KKAPortalAccessAdmin = { render };
