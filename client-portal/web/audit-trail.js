import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

const supabase=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
const esc=v=>String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
let rows=[];

function labelAction(value){
  return String(value||"").replace(/[_-]+/g," ").replace(/\b\w/g,m=>m.toUpperCase());
}

function formatDate(value){
  const d=new Date(value);
  return Number.isNaN(d.getTime())?"—":d.toLocaleString([], {dateStyle:"medium",timeStyle:"short"});
}

function metadataText(value){
  if(!value||typeof value!=="object")return "";
  const entries=Object.entries(value).filter(([k,v])=>v!==null&&v!==undefined&&v!=="").slice(0,6);
  return entries.map(([k,v])=>`${labelAction(k)}: ${typeof v==="object"?JSON.stringify(v):String(v)}`).join(" · ");
}

function renderRows(){
  const body=document.querySelector("#audit-rows");
  const count=document.querySelector("#audit-count");
  const query=String(document.querySelector("#audit-search")?.value||"").toLowerCase().trim();
  const action=String(document.querySelector("#audit-action")?.value||"");
  const filtered=rows.filter(r=>{
    if(action&&r.action!==action)return false;
    if(!query)return true;
    return [r.action,r.entity_type,r.entity_id,r.actor_id,metadataText(r.metadata)].join(" ").toLowerCase().includes(query);
  });
  if(count)count.textContent=`${filtered.length} event${filtered.length===1?"":"s"}`;
  if(!body)return;
  body.innerHTML=filtered.length?filtered.map(r=>`<tr><td><strong>${esc(labelAction(r.action))}</strong><small>${esc(metadataText(r.metadata)||"No additional details")}</small></td><td><span class="audit-entity">${esc(labelAction(r.entity_type))}</span><small>${esc(r.entity_id||"—")}</small></td><td><small>${esc(r.actor_id||"System")}</small></td><td><time datetime="${esc(r.created_at)}">${esc(formatDate(r.created_at))}</time></td></tr>`).join(""): `<tr><td colspan="4" class="audit-empty-cell">No matching audit events.</td></tr>`;
}

async function loadAudit(){
  const body=document.querySelector("#audit-rows");
  if(!body)return;
  body.innerHTML=`<tr><td colspan="4" class="audit-empty-cell">Loading audit events…</td></tr>`;
  const {data,error}=await supabase.from("audit_logs").select("id,actor_id,client_id,action,entity_type,entity_id,metadata,created_at").order("created_at",{ascending:false}).limit(200);
  if(error){body.innerHTML=`<tr><td colspan="4" class="audit-empty-cell">Unable to load the audit trail. Check staff access and try again.</td></tr>`;return}
  rows=data??[];
  const select=document.querySelector("#audit-action");
  if(select){const actions=[...new Set(rows.map(r=>r.action).filter(Boolean))];select.innerHTML=`<option value="">All actions</option>${actions.map(a=>`<option value="${esc(a)}">${esc(labelAction(a))}</option>`).join("")}`;}
  renderRows();
}

function renderAuditTrail(){
  const main=document.querySelector(".portal-main");
  if(!main)return;
  document.querySelectorAll(".sidebar nav a").forEach(a=>a.classList.toggle("active",a.dataset.view==="activity"));
  main.innerHTML=`<header><div><p class="eyebrow">CONTROL &amp; GOVERNANCE</p><h1>Audit trail</h1><p class="muted">A read-only record of important portal actions.</p></div><div class="page-actions"><button class="secondary" id="audit-refresh">Refresh</button></div></header><section class="panel audit-panel"><div class="audit-toolbar"><div><p class="eyebrow">RECENT EVENTS</p><h2>Activity history</h2><p class="muted" id="audit-count">Loading…</p></div><div class="audit-filters"><input id="audit-search" type="search" placeholder="Search activity" aria-label="Search audit activity"><select id="audit-action" aria-label="Filter by action"><option value="">All actions</option></select></div></div><div class="table-wrap"><table class="audit-table"><thead><tr><th>Action</th><th>Entity</th><th>Actor</th><th>When</th></tr></thead><tbody id="audit-rows"></tbody></table></div></section>`;
  document.querySelector("#audit-search")?.addEventListener("input",renderRows);
  document.querySelector("#audit-action")?.addEventListener("change",renderRows);
  document.querySelector("#audit-refresh")?.addEventListener("click",loadAudit);
  loadAudit();
}

document.addEventListener("click",e=>{
  const link=e.target.closest('a[data-view="activity"]');
  if(!link)return;
  e.preventDefault();
  e.stopPropagation();
  renderAuditTrail();
},true);
