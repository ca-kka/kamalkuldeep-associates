import { createClient as createSupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

const supabase=createSupabaseClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
const STORAGE_KEY="kka-selected-client";
const esc=v=>String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));

async function isClient(){
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return false;
  const {data:p}=await supabase.from("profiles").select("role,active").eq("id",user.id).maybeSingle();
  return p?.active===true&&p.role==="client";
}

async function getSelectedClient(){
  const id=localStorage.getItem(STORAGE_KEY);
  if(!id)return null;
  const {data,error}=await supabase.from("clients").select("id,display_name,legal_name").eq("id",id).maybeSingle();
  if(error||!data)return null;
  return data;
}

async function render(){
  if(!(await isClient()))return false;
  const client=await getSelectedClient();
  if(!client)return false;
  const main=document.querySelector(".portal-main");
  if(!main)return true;
  document.querySelectorAll(".sidebar nav a").forEach(a=>a.classList.toggle("active",a.dataset.view==="documents"));
  main.innerHTML=`<header><div><p class="eyebrow">PRIVATE DOCUMENTS</p><h1>${esc(client.display_name||client.legal_name)}</h1><p class="muted">Documents available for the selected family profile.</p></div><div class="page-actions"><button class="secondary" id="family-doc-refresh" type="button">Refresh</button></div></header><section class="panel"><div class="panel-head"><div><p class="eyebrow">DOCUMENTS</p><h2>Profile documents</h2><p class="muted" id="family-doc-status">Loading documents…</p></div></div><div class="table-wrap"><table><thead><tr><th>Document</th><th>Folder</th><th>Financial year</th><th>Period</th><th>Status</th></tr></thead><tbody id="family-doc-rows"><tr><td colspan="5">Loading…</td></tr></tbody></table></div></section>`;
  document.querySelector("#family-doc-refresh")?.addEventListener("click",load);
  await load();
  return true;
}

async function load(){
  const client=await getSelectedClient();
  const rows=document.querySelector("#family-doc-rows"),status=document.querySelector("#family-doc-status");
  if(!client||!rows)return;
  const {data,error}=await supabase.from("documents").select("id,original_filename,area,financial_year,filing_period,status,client_id,created_at").eq("client_id",client.id).order("created_at",{ascending:false}).limit(100);
  if(error){rows.innerHTML=`<tr><td colspan="5">Unable to load documents.</td></tr>`;if(status)status.textContent="The selected profile could not be loaded.";return;}
  if(status)status.textContent=`${data?.length||0} document(s) for the selected profile`;
  rows.innerHTML=(data||[]).map(d=>`<tr><td><strong>${esc(d.original_filename)}</strong></td><td>${esc(d.area||"Other")}</td><td>${esc(d.financial_year||"—")}</td><td>${esc(d.filing_period||"—")}</td><td><i class="pill ${d.status==="accepted"?"success":"neutral"}">${esc(d.status||"—")}</i></td></tr>`).join("")||`<tr><td colspan="5">No documents for this profile yet.</td></tr>`;
}

let busy=false;
async function openForClient(){if(busy)return;busy=true;try{await render()}finally{busy=false}}

document.addEventListener("click",e=>{
  const link=e.target.closest('a[data-view="documents"]');
  if(!link)return;
  setTimeout(openForClient,0);
},true);
window.addEventListener("kka-family-profile-change",()=>{if(document.querySelector('[data-view="documents"].active'))setTimeout(openForClient,0)});
