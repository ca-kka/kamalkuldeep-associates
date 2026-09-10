import { createClient as createSupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

const supabase = createSupabaseClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const esc = v => String(v ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));

async function setupStaffAccess() {
  const root = document.querySelector(".portal-main");
  if (!root) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { data: profile } = await supabase.from("profiles").select("role,full_name,active").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin" || !profile.active) {
    root.innerHTML = `<section class="panel"><p class="eyebrow">ACCESS CONTROL</p><h2>Administrator access required</h2><p class="muted">Only an administrator can manage staff and administrator profiles.</p></section>`;
    return;
  }
  root.innerHTML = `<header><div><p class="eyebrow">ACCESS MANAGEMENT</p><h1>Staff &amp; Access</h1><p class="muted">Manage who can enter the KKA staff portal and which role they hold.</p></div><div class="page-actions"><button class="secondary" id="staff-refresh">Refresh</button></div></header><section class="panel"><div class="panel-head"><div><p class="eyebrow">PORTAL USERS</p><h2>Staff profiles</h2></div><span class="pill neutral" id="staff-count">Loading…</span></div><div class="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Manage</th></tr></thead><tbody id="staff-rows"><tr><td colspan="5">Loading…</td></tr></tbody></table></div><p class="muted small">Role changes are enforced server-side. A visual selection never grants access by itself.</p></section>`;
  const rows = root.querySelector("#staff-rows"), count = root.querySelector("#staff-count");
  async function call(action, payload = {}) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("The session has expired. Please sign in again.");
    const response = await fetch(`${SUPABASE_URL}/functions/v1/manage-staff-account`, { method:"POST", headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`}, body:JSON.stringify({action,...payload}) });
    const result = await response.json().catch(()=>({}));
    if (!response.ok) throw new Error(result.error || "Staff management action failed.");
    return result;
  }
  async function load() {
    rows.innerHTML = `<tr><td colspan="5">Loading…</td></tr>`;
    try {
      const profiles = (await call("list")).profiles ?? [];
      count.textContent = `${profiles.length} profile${profiles.length===1?"":"s"}`;
      rows.innerHTML = profiles.map(p => `<tr><td><strong>${esc(p.full_name||"Unnamed")}</strong><small>${p.id===user.id?"Current account":""}</small></td><td>—</td><td><span class="pill ${p.role==="admin"?"success":"neutral"}">${p.role==="admin"?"Administrator":"Staff"}</span></td><td><span class="pill ${p.active?"success":"neutral"}">${p.active?"Active":"Inactive"}</span></td><td><button class="secondary table-action" data-manage-staff="${esc(p.id)}" ${p.id===user.id?'disabled title="The current administrator cannot be changed here"':''}>Manage</button></td></tr>`).join("") || `<tr><td colspan="5">No staff profiles found.</td></tr>`;
      rows.querySelectorAll("[data-manage-staff]").forEach(b=>b.addEventListener("click",()=>showManage(b.dataset.manageStaff,profiles.find(p=>p.id===b.dataset.manageStaff))));
    } catch(error) { count.textContent="Unavailable"; rows.innerHTML=`<tr><td colspan="5">${esc(error.message)}</td></tr>`; }
  }
  function showManage(id, profile) {
    if (!profile) return;
    const modal=document.createElement("div"); modal.className="modal-backdrop";
    modal.innerHTML=`<section class="modal compact-modal" role="dialog" aria-modal="true"><div class="modal-head"><div><p class="eyebrow">PROFILE ACCESS</p><h2>Manage access</h2><p class="muted">${esc(profile.full_name||"Unnamed")}</p></div><button class="modal-close" type="button">×</button></div><form id="staff-access-form" class="form-grid"><div class="full"><span class="field-label">Role</span><div class="role-choice"><label class="role-option"><input type="radio" name="role" value="staff" ${profile.role==="staff"?"checked":""}><span><strong>Staff</strong><small>Operations and document access</small></span></label><label class="role-option"><input type="radio" name="role" value="admin" ${profile.role==="admin"?"checked":""}><span><strong>Administrator</strong><small>Full administrative access</small></span></label></div></div><label class="full role-option"><input type="checkbox" name="active" ${profile.active?"checked":""}><span><strong>Account active</strong><small>Allow this account to sign in</small></span></label><div class="form-message full" id="staff-access-message">Changes take effect only after the protected update succeeds.</div><div class="modal-actions full"><button type="button" class="secondary modal-close">Cancel</button><button type="submit" class="primary">Save access</button></div></form></section>`;
    document.body.appendChild(modal); modal.querySelectorAll(".modal-close").forEach(b=>b.addEventListener("click",()=>modal.remove()));
    modal.querySelector("#staff-access-form").addEventListener("submit",async e=>{e.preventDefault();const m=modal.querySelector("#staff-access-message"),f=new FormData(e.currentTarget),role=String(f.get("role")||""),active=f.get("active")==="on";if(!["staff","admin"].includes(role)){m.textContent="Select exactly one role.";return}m.textContent="Saving…";try{await call("update",{profileId:id,role,active});modal.remove();await load()}catch(error){m.textContent=error.message}});
  }
  root.querySelector("#staff-refresh").addEventListener("click",load); await load();
}

document.addEventListener("click", event => {
  const link = event.target.closest?.('a[data-view="staff-access"]');
  if (!link) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  setupStaffAccess();
}, true);
