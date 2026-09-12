import { createClient as createSupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

const supabase=createSupabaseClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
const STORAGE_KEY="kka-selected-client";
const STYLE_ID="kka-client-dashboard-v2-style";
const esc=v=>String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));

function installStyles(){
  if(document.getElementById(STYLE_ID))return;
  const s=document.createElement("style");s.id=STYLE_ID;s.textContent=`
.client-profile-bar{display:flex;align-items:center;gap:14px;margin:0 0 18px;padding:14px 16px;border:1px solid var(--line);border-radius:14px;background:var(--soft);box-shadow:var(--shadow)}
.client-profile-copy{min-width:180px}.client-profile-copy .eyebrow{margin-bottom:3px}.client-profile-copy strong{display:block;font:700 17px Georgia,serif}
.client-profile-select{flex:1;min-width:220px;max-width:460px;padding:11px 13px;border:1px solid #cbd6cf;border-radius:9px;background:var(--white);color:var(--ink);font:600 13px inherit;cursor:pointer}.client-profile-select:focus{outline:2px solid #b9d2c3;border-color:var(--forest)}
.client-home-header{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;margin-bottom:18px}.client-home-grid{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,.9fr);gap:16px}.client-welcome-card,.client-action-card{min-height:205px}.client-welcome-card h2,.client-action-card h2{margin-top:5px}.client-identity{display:flex;flex-wrap:wrap;gap:8px;margin-top:20px}.client-identity span{display:inline-flex;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--soft);font-size:12px;color:var(--ink)}
.client-home-actions{display:flex;flex-wrap:wrap;gap:9px;margin-top:22px}.client-home-actions .primary,.client-home-actions .secondary{width:auto;margin:0}.client-upload-note{display:block;padding:10px 12px;border-radius:8px;background:var(--soft);border:1px solid var(--line);color:var(--muted);font-size:12px;line-height:1.4}.client-status-card{display:flex;justify-content:space-between;align-items:center;gap:18px;margin-top:16px}.client-status-card h2{margin-top:4px}.client-status-card .pill{flex:0 0 auto}
@media(max-width:800px){.client-profile-bar{align-items:stretch;flex-direction:column}.client-profile-select{max-width:none;width:100%}.client-home-grid{grid-template-columns:1fr}}@media(max-width:460px){.client-home-header{display:block}.client-home-header .user{margin-top:14px}.client-status-card{display:block}.client-status-card .pill{margin-top:12px}}
`;document.head.appendChild(s);
}

async function getClientContext(){
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return null;
  const {data:profile}=await supabase.from("profiles").select("role,full_name,active").eq("id",user.id).maybeSingle();
  if(profile?.role!=="client"||!profile.active)return null;
  const {data:membership}=await supabase.from("client_memberships").select("client_id,can_upload").eq("user_id",user.id).maybeSingle();
  if(!membership?.client_id)return null;
  const {data:clients,error}=await supabase.from("clients").select("id,legal_name,display_name,pan,gstin,active").eq("active",true).order("legal_name",{ascending:true});
  if(error)return null;
  const accessible=(clients??[]).filter(c=>c.id===membership.client_id||c.id);
  const saved=localStorage.getItem(STORAGE_KEY);
  const selectedId=accessible.some(c=>c.id===saved)?saved:membership.client_id;
  const client=accessible.find(c=>c.id===selectedId)||accessible.find(c=>c.id===membership.client_id);
  if(!client)return null;
  return {profile,membership,clients:accessible,client,selectedId};
}

async function renderClientDashboard(){
  installStyles();
  const ctx=await getClientContext();
  if(!ctx)return false;
  const main=document.querySelector(".portal-main");
  if(!main)return false;
  document.querySelectorAll(".sidebar nav a").forEach(a=>a.classList.toggle("active",a.dataset.view==="dashboard"));
  const options=ctx.clients.map(c=>`<option value="${esc(c.id)}" ${c.id===ctx.selectedId?"selected":""}>${esc(c.display_name||c.legal_name)}${c.display_name&&c.legal_name&&c.display_name!==c.legal_name?` — ${esc(c.legal_name)}`:""}</option>`).join("");
  main.innerHTML=`<div class="client-profile-bar"><div class="client-profile-copy"><p class="eyebrow">CURRENT PROFILE</p><strong>Profile &amp; account</strong></div><select class="client-profile-select" id="client-profile-select" aria-label="Change profile">${options}</select></div>
<header class="client-home-header"><div><p class="eyebrow">PRIVATE KKA WORKSPACE</p><h1>Welcome, ${esc(ctx.client.display_name||ctx.client.legal_name||"Client")}</h1><p class="muted">Your documents, securely organised in one place.</p></div><button class="user" id="client-signout" type="button">Sign out</button></header>
<section class="client-home-grid"><article class="panel client-welcome-card"><p class="eyebrow">CLIENT PROFILE</p><h2>${esc(ctx.client.display_name||ctx.client.legal_name||"Client profile")}</h2><p class="muted">${esc(ctx.client.legal_name||"")}</p><div class="client-identity"><span>${ctx.client.pan?`PAN · ${esc(ctx.client.pan)}`:"PAN not available"}</span><span>${ctx.client.gstin?`GSTIN · ${esc(ctx.client.gstin)}`:"GSTIN not available"}</span></div></article>
<article class="panel client-action-card"><p class="eyebrow">DOCUMENTS</p><h2>Document workspace</h2><p class="muted">View documents available for the selected profile.</p><div class="client-home-actions"><button class="primary" id="client-documents" type="button">View documents</button>${ctx.membership.can_upload?`<button class="secondary" id="client-upload" type="button">Upload documents</button>`:`<span class="client-upload-note">Client upload is currently disabled by KKA.</span>`}</div></article></section>
<section class="panel client-status-card"><div><p class="eyebrow">ACCESS</p><h2>Workspace access</h2><p class="muted">${ctx.membership.can_upload?"Document upload is enabled for this profile.":"Document upload is disabled for this profile. Contact KKA if access needs to change."}</p></div><span class="pill ${ctx.membership.can_upload?"success":"neutral"}">${ctx.membership.can_upload?"Upload enabled":"View only"}</span></section>`;
  document.getElementById("client-profile-select")?.addEventListener("change",async e=>{localStorage.setItem(STORAGE_KEY,e.target.value);await renderClientDashboard()});
  document.getElementById("client-signout")?.addEventListener("click",async()=>{await supabase.auth.signOut();localStorage.removeItem(STORAGE_KEY);location.reload()});
  document.getElementById("client-documents")?.addEventListener("click",()=>document.querySelector('a[data-view="documents"]')?.click());
  document.getElementById("client-upload")?.addEventListener("click",()=>document.querySelector('a[data-view="documents"]')?.click());
  return true;
}

window.KKAClientDashboardRender=renderClientDashboard;
window.KKAClientSession=false;
