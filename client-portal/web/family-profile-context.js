import { createClient as createSupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

const supabase=createSupabaseClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
const STORAGE_KEY="kka-selected-client";
const esc=v=>String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));

async function selectedClient(){
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return null;
  const {data:profile}=await supabase.from("profiles").select("role").eq("id",user.id).maybeSingle();
  if(profile?.role!=="client")return null;
  const id=localStorage.getItem(STORAGE_KEY);
  if(!id)return null;
  const {data:membership}=await supabase.from("client_memberships").select("client_id").eq("user_id",user.id).limit(1).maybeSingle();
  if(!membership?.client_id)return null;
  const {data:client}=await supabase.from("clients").select("id,display_name,legal_name").eq("id",id).maybeSingle();
  return client||null;
}

async function applyScope(){
  const client=await selectedClient();
  if(!client)return;
  const main=document.querySelector(".portal-main");
  if(!main)return;
  const {data:docs,error}=await supabase.from("documents").select("id,original_filename,area,financial_year,filing_period,status,client_id,clients(display_name,legal_name)").eq("client_id",client.id).order("created_at",{ascending:false}).limit(100);
  if(error)return;
  const stats=main.querySelector(".stats"),review=main.querySelector(".review"),tbody=main.querySelector(".activity tbody");
  if(stats)stats.innerHTML=[["Documents",docs.length,"Documents for this profile"],["Needs review",docs.filter(d=>d.status==="review").length,"KKA is reviewing these"],["Duplicate checks",docs.filter(d=>d.status==="duplicate").length,"Held before storage"],["Active profile","Yes","Selected family profile"]].map(([l,v,n])=>`<article><p>${l}</p><strong>${v}</strong><span class="muted">${n}</span></article>`).join("");
  if(review){const pending=docs.filter(d=>d.status==="review").slice(0,3);review.innerHTML=`<div class="panel-head"><div><p class="eyebrow">KKA REVIEW</p><h2>Review queue</h2></div></div>${pending.length?pending.map(d=>`<div class="row"><span class="file-icon">${esc(String(d.original_filename||"FILE").split(".").pop().toUpperCase())}</span><div><strong>${esc(d.original_filename)}</strong><p>${esc(d.area)} · ${esc(d.financial_year||"period pending")}</p></div><span class="muted">Pending</span></div>`).join(""):`<p class="muted">No documents are awaiting review.</p>`}`}
  if(tbody)tbody.innerHTML=docs.slice(0,8).map(d=>`<tr><td>${esc(d.original_filename)}</td><td>${esc(d.clients?.display_name??d.clients?.legal_name??client.display_name??client.legal_name)}</td><td>${esc(d.area)} · ${esc(d.financial_year??"—")}${d.filing_period?` · ${esc(d.filing_period)}`:""}</td><td><i class="pill ${d.status==="accepted"?"success":"neutral"}">${esc(d.status)}</i></td></tr>`).join("")||`<tr><td colspan="4">No documents for this profile yet.</td></tr>`;
}

function schedule(){setTimeout(applyScope,0)}
window.addEventListener("kka-family-profile-change",schedule);
window.addEventListener("kka-family-profile-refresh",schedule);
window.addEventListener("kka-family-dashboard-ready",schedule);
window.addEventListener("load",schedule);
