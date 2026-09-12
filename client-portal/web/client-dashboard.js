import { createClient as createSupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

const supabase=createSupabaseClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
const STORAGE_KEY="kka-selected-client";
const esc=v=>String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
let clientSession=false;

async function getClientContext(){
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return null;
  const {data:profile}=await supabase.from("profiles").select("role,full_name,active").eq("id",user.id).maybeSingle();
  if(profile?.role!=="client"||!profile.active)return null;
  const {data:membership}=await supabase.from("client_memberships").select("client_id,can_upload").eq("user_id",user.id).maybeSingle();
  if(!membership?.client_id)return null;
  const selectedId=localStorage.getItem(STORAGE_KEY)||membership.client_id;
  const {data:client}=await supabase.from("clients").select("id,legal_name,display_name,pan,gstin").eq("id",selectedId).eq("active",true).maybeSingle();
  if(!client)return null;
  return {user,profile,membership,client,selectedId};
}

async function syncClientSession(session){
  if(!session?.user){clientSession=false;return;}
  const {data:profile}=await supabase.from("profiles").select("role,active").eq("id",session.user.id).maybeSingle();
  clientSession=profile?.active===true&&profile.role==="client";
  window.KKAClientSession=clientSession;
}

async function renderClientDashboard(){
  const ctx=await getClientContext();
  if(!ctx)return false;
  const main=document.querySelector(".portal-main");
  if(!main)return false;
  document.querySelectorAll(".sidebar nav a").forEach(a=>a.classList.toggle("active",a.dataset.view==="dashboard"));
  main.innerHTML=`<header class="client-home-header"><div><p class="eyebrow">PRIVATE KKA WORKSPACE</p><h1>Welcome, ${esc(ctx.profile.full_name||ctx.client.display_name||ctx.client.legal_name||"Client")}</h1><p class="muted">Your documents, securely organised in one place.</p></div><button class="user" id="client-signout" type="button">Sign out</button></header>
<section class="client-home-grid">
  <article class="panel client-welcome-card"><p class="eyebrow">CURRENT PROFILE</p><h2>${esc(ctx.client.display_name||ctx.client.legal_name||"Client profile")}</h2><p class="muted">${esc(ctx.client.legal_name||"")}</p><div class="client-identity"><span>${ctx.client.pan?`PAN · ${esc(ctx.client.pan)}`:"PAN not available"}</span><span>${ctx.client.gstin?`GSTIN · ${esc(ctx.client.gstin)}`:"GSTIN not available"}</span></div></article>
  <article class="panel client-action-card"><p class="eyebrow">DOCUMENTS</p><h2>Document workspace</h2><p class="muted">View documents available for the selected profile.</p><div class="client-home-actions"><button class="primary" id="client-documents" type="button">View documents</button>${ctx.membership.can_upload?`<button class="secondary" id="client-upload" type="button">Upload documents</button>`:`<span class="client-upload-note">Client upload is currently disabled by KKA.</span>`}</div></article>
</section>
<section class="panel client-status-card"><div><p class="eyebrow">ACCESS</p><h2>Workspace access</h2><p class="muted">${ctx.membership.can_upload?"Document upload is enabled for this profile.":"Document upload is disabled for this profile. Contact KKA if access needs to change."}</p></div><span class="pill ${ctx.membership.can_upload?"success":"neutral"}">${ctx.membership.can_upload?"Upload enabled":"View only"}</span></section>`;
  document.getElementById("client-signout")?.addEventListener("click",async()=>{await supabase.auth.signOut();location.reload()});
  document.getElementById("client-documents")?.addEventListener("click",()=>document.querySelector('a[data-view="documents"]')?.click());
  document.getElementById("client-upload")?.addEventListener("click",()=>document.querySelector('a[data-view="documents"]')?.click());
  return true;
}

document.addEventListener("click",e=>{
  const link=e.target.closest('a[data-view="dashboard"]');
  if(!link||!clientSession||!document.querySelector(".portal-main"))return;
  e.preventDefault();e.stopPropagation();
  renderClientDashboard().catch(()=>{});
},true);

supabase.auth.onAuthStateChange((_event,session)=>{
  setTimeout(async()=>{await syncClientSession(session);if(clientSession)await renderClientDashboard().catch(()=>{});},0);
});

supabase.auth.getSession().then(({data:{session}})=>syncClientSession(session)).catch(()=>{});
