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
async function session(){const {data:{session}}=await supabase.auth.getSession();return session?.access_token||null}

function installStyles(){
  if(document.getElementById("client-documents-polish"))return;
  const s=document.createElement("style");s.id="client-documents-polish";s.textContent=`
.client-doc-folders{display:grid;gap:14px}.client-doc-folder{border:1px solid var(--line);border-radius:14px;background:var(--white);overflow:hidden}.client-doc-folder-head{display:flex;justify-content:space-between;align-items:center;gap:15px;padding:15px 17px;background:var(--soft);border-bottom:1px solid var(--line)}.client-doc-folder-title{display:flex;align-items:center;gap:11px}.client-doc-folder-icon{width:38px;height:38px;display:grid;place-items:center;border-radius:10px;background:var(--white);border:1px solid var(--line);font-size:18px}.client-doc-folder-title strong{display:block;font:700 17px Georgia,serif}.client-doc-folder-title span{display:block;margin-top:2px;font-size:11px;color:var(--muted)}.client-doc-subfolder{margin:14px 14px 0;border:1px solid var(--line);border-radius:11px;overflow:hidden}.client-doc-subfolder:last-child{margin-bottom:14px}.client-doc-subfolder-head{padding:10px 13px;background:var(--soft);font-size:12px;font-weight:700}.client-doc-table{width:100%;border-collapse:collapse}.client-doc-table th,.client-doc-table td{padding:10px 12px;border-top:1px solid var(--line);text-align:left;font-size:12px;vertical-align:middle}.client-doc-table th{font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);background:var(--white)}.client-doc-name{max-width:480px}.client-doc-name strong{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.client-doc-actions{display:flex;justify-content:flex-end;gap:6px;white-space:nowrap}.client-doc-action{width:32px;height:30px;padding:0;display:grid;place-items:center;border:1px solid var(--line);border-radius:7px;background:var(--white);cursor:pointer;font-size:14px}.client-doc-action:hover{border-color:var(--forest);background:var(--soft)}.client-doc-empty{padding:24px;text-align:center;color:var(--muted);font-size:12px}.client-doc-notice{margin:0 0 14px;padding:10px 12px;border:1px solid var(--line);border-radius:9px;background:var(--soft);font-size:11px;color:var(--muted)}
@media(max-width:800px){.client-doc-table th:nth-child(3),.client-doc-table td:nth-child(3){display:none}.client-doc-name{max-width:260px}}@media(max-width:560px){.client-doc-folder-head{align-items:flex-start}.client-doc-table th:nth-child(2),.client-doc-table td:nth-child(2){display:none}.client-doc-name{max-width:180px}}
`;document.head.appendChild(s);
}

function folderIcon(area){return ({gst:"▣",tds:"◫",income_tax:"▤",accounts:"▥",mca:"▦",other:"□"}[area]||"□")}
function folderLabel(area){return ({gst:"GST",tds:"TDS",income_tax:"Income Tax",accounts:"Accounts",mca:"MCA",other:"Other"}[area]||"Other")}
function groupKey(d){
  if(d.area==="gst"||d.area==="tds")return `${d.financial_year||"Year not set"} · ${d.filing_period||"Period not set"}`;
  if(d.area==="income_tax"||d.area==="accounts"||d.area==="mca")return d.financial_year||"Year not set";
  return "Documents";
}
function renderFolders(data){
  const order=["gst","tds","income_tax","accounts","mca","other"];
  const grouped={};
  for(const d of data||[]){const area=d.area||"other";(grouped[area]??=[]).push(d)}
  const areas=order.filter(a=>grouped[a]?.length).concat(Object.keys(grouped).filter(a=>!order.includes(a)));
  if(!areas.length)return `<div class="client-doc-empty">No documents for this profile yet.</div>`;
  return `<div class="client-doc-folders">${areas.map(area=>{const docs=grouped[area],groups={};docs.forEach(d=>(groups[groupKey(d)]??=[]).push(d));const keys=Object.keys(groups);return `<section class="client-doc-folder"><div class="client-doc-folder-head"><div class="client-doc-folder-title"><div class="client-doc-folder-icon">${folderIcon(area)}</div><div><strong>${folderLabel(area)}</strong><span>${docs.length} document${docs.length===1?"":"s"}</span></div></div></div>${keys.map(k=>`<div class="client-doc-subfolder"><div class="client-doc-subfolder-head">${esc(k)}</div><table class="client-doc-table"><thead><tr><th>Document</th><th>Status</th><th>Actions</th></tr></thead><tbody>${groups[k].map(d=>`<tr><td class="client-doc-name"><strong title="${esc(d.original_filename)}">${esc(d.original_filename)}</strong></td><td><i class="pill ${d.status==="accepted"?"success":"neutral"}">${esc(d.status||"—")}</i></td><td><div class="client-doc-actions">${d.status==="accepted"?`<button class="client-doc-action" data-doc-action="view" data-doc-id="${esc(d.id)}" title="Open" aria-label="Open">◉</button><button class="client-doc-action" data-doc-action="download" data-doc-id="${esc(d.id)}" title="Download" aria-label="Download">↓</button><button class="client-doc-action" data-doc-action="share" data-doc-id="${esc(d.id)}" title="Copy secure share link" aria-label="Share">↗</button>`:`<span class="muted">KKA review</span>`}</div></td></tr>`).join("")}</tbody></table></div>`).join("")}</section>`}).join("")}</div>`;
}

async function accessDocument(documentId,action){
  const token=await session();
  if(!token)throw new Error("Your session has expired. Please sign in again.");
  const r=await fetch(`${SUPABASE_URL}/functions/v1/client-document-access`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},body:JSON.stringify({documentId,action})});
  const data=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(data.error||"Document access failed.");
  return data;
}

async function handleAction(e){
  const b=e.target.closest?.("[data-doc-action]");if(!b)return;
  const id=b.dataset.docId,action=b.dataset.docAction;b.disabled=true;
  try{
    const result=await accessDocument(id,action);
    if(action==="view"){window.open(result.url,"_blank","noopener,noreferrer")}
    else if(action==="download"){const a=document.createElement("a");a.href=result.url;a.target="_blank";a.rel="noopener";a.click()}
    else {await navigator.clipboard.writeText(result.url);b.title="Link copied";b.textContent="✓";setTimeout(()=>{b.textContent="↗";b.title="Copy secure share link"},1500)}
  }catch(err){alert(err instanceof Error?err.message:"Document action failed.")}
  finally{b.disabled=false}
}

async function render(){
  if(!(await isClient()))return false;
  const client=await getSelectedClient();if(!client)return false;
  installStyles();
  const main=document.querySelector(".portal-main");if(!main)return true;
  document.querySelectorAll(".sidebar nav a").forEach(a=>a.classList.toggle("active",a.dataset.view==="documents"));
  main.innerHTML=`<header><div><p class="eyebrow">PRIVATE DOCUMENTS</p><h1>${esc(client.display_name||client.legal_name)}</h1><p class="muted">Documents available for the selected family profile.</p></div><div class="page-actions"><button class="secondary" id="family-doc-refresh" type="button">Refresh</button></div></header><section class="panel"><div class="panel-head"><div><p class="eyebrow">DOCUMENT WORKSPACE</p><h2>Documents by folder</h2><p class="muted" id="family-doc-status">Loading documents…</p></div></div><div class="client-doc-notice">Open, download or share an accepted document using the action buttons. Share links expire automatically.</div><div id="family-doc-content"><div class="client-doc-empty">Loading…</div></div></section>`;
  document.querySelector("#family-doc-refresh")?.addEventListener("click",load);
  document.querySelector("#family-doc-content")?.addEventListener("click",handleAction);
  await load();return true;
}

async function load(){
  const client=await getSelectedClient(),status=document.querySelector("#family-doc-status"),content=document.querySelector("#family-doc-content");
  if(!client||!content)return;
  const {data,error}=await supabase.from("documents").select("id,original_filename,area,financial_year,filing_period,status,client_id,created_at").eq("client_id",client.id).order("created_at",{ascending:false}).limit(100);
  if(error){content.innerHTML=`<div class="client-doc-empty">Unable to load documents.</div>`;if(status)status.textContent="The selected profile could not be loaded.";return;}
  if(status)status.textContent=`${data?.length||0} document(s) for the selected profile`;
  content.innerHTML=renderFolders(data||[]);
}

let busy=false;
async function openForClient(){if(busy)return;busy=true;try{await render()}finally{busy=false}}

document.addEventListener("click",e=>{const link=e.target.closest('a[data-view="documents"]');if(!link)return;setTimeout(openForClient,0)},true);
window.addEventListener("kka-family-profile-change",()=>{if(document.querySelector('[data-view="documents"].active'))setTimeout(openForClient,0)});
