import { createClient as createSupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

const supabase=createSupabaseClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
let user=null,profile=null;
const esc=v=>String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
const staff=()=>["admin","staff"].includes(profile?.role);
const AREAS=["gst","tds","income_tax","accounts","mca","other"];
const MONTHS=[["01","January"],["02","February"],["03","March"],["04","April"],["05","May"],["06","June"],["07","July"],["08","August"],["09","September"],["10","October"],["11","November"],["12","December"]];
const areaLabel=a=>a==="income_tax"?"Income Tax":a==="mca"?"MCA":a.toUpperCase();
const financialYears=()=>{const now=new Date(),start=now.getMonth()>=3?now.getFullYear():now.getFullYear()-1;return Array.from({length:8},(_,i)=>{const y=start-i;return `${y}-${String((y+1)%100).padStart(2,"0")}`})};

async function loadIdentity(){
  const {data:{user:u}}=await supabase.auth.getUser();
  user=u;
  if(!user)return false;
  const {data:p}=await supabase.from("profiles").select("role,full_name,active").eq("id",user.id).maybeSingle();
  profile=p;
  return !!p?.active&&staff();
}

function setActive(){
  document.querySelectorAll(".sidebar nav a").forEach(a=>a.classList.toggle("active",a.dataset.view==="review"));
}

function notify(type,message,detail=""){try{window.KKANotify?.[type]?.(message,detail)}catch{}}

async function resolveItem(documentId,action){
  const row=document.querySelector(`[data-review-row="${documentId}"]`);
  if(!row)return;
  const area=row.querySelector("[data-field=area]")?.value;
  const financialYear=row.querySelector("[data-field=financial-year]")?.value;
  const period=row.querySelector("[data-field=period]")?.value;
  const clientId=row.querySelector("[data-field=client]")?.value;
  if(action==="accept"&&!clientId){notify("error","Client is required before accepting the document.");return}
  if(action==="accept"&&!area){notify("error","Document area is required before accepting the document.");return}
  if(action==="accept"&&!financialYear){notify("error","Financial year is required before accepting the document.");return}
  if(action==="accept"&&["gst","other"].includes(area)&&!period){notify("error",area==="gst"?"GST month is required before accepting the document.":"Month is required for Other documents before accepting the document.");return}
  if(action==="accept"&&area==="tds"&&!period){notify("error","TDS quarter is required before accepting the document.");return}
  const {data:{session}}=await supabase.auth.getSession();
  if(!session?.access_token){notify("error","The session has expired. Please sign in again.");return}
  const button=row.querySelector(`[data-action="${action}"]`);if(button)button.disabled=true;
  notify("info",action==="accept"?"Accepting and classifying document…":"Rejecting document…");
  try{
    const r=await fetch(`${SUPABASE_URL}/functions/v1/resolve-review`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({documentId,clientId:clientId||null,area:area||"other",financialYear:financialYear||null,period:period||null,action})});
    const result=await r.json().catch(()=>({}));
    if(!r.ok){notify("error",result.error||`The review action was not completed (HTTP ${r.status}).`);if(button)button.disabled=false;return}
    notify("success",action==="accept"?"Document accepted and classified successfully.":"Document rejected successfully.");
    await render();
  }catch(error){notify("error",error?.message||"The review action was not completed.");if(button)button.disabled=false}
}

async function render(){
  setActive();
  const main=document.querySelector(".portal-main");
  if(!main)return;
  main.innerHTML=`<header><div><p class="eyebrow">DOCUMENT CONTROL</p><h1>Review queue</h1><p class="muted">Review files that could not be confidently classified during upload.</p></div><button class="secondary" id="refresh-review">Refresh</button></header><section class="panel"><div class="panel-head"><div><p class="eyebrow">PENDING REVIEW</p><h2>Files awaiting action</h2><p class="muted">Select the final client and classification. Accepting a file sends it to the matching OneDrive client folder when OneDrive storage is available.</p></div></div><div id="review-list"><p class="muted">Loading review queue…</p></div></section>`;
  document.getElementById("refresh-review")?.addEventListener("click",render);
  const [docsResult,clientsResult]=await Promise.all([
    supabase.from("documents").select("id,original_filename,area,financial_year,filing_period,status,storage_path,created_at,client_id,clients(display_name,legal_name)").eq("status","review").order("created_at",{ascending:false}),
    supabase.from("clients").select("id,legal_name,display_name").eq("active",true).order("legal_name")
  ]);
  const box=document.getElementById("review-list");
  if(docsResult.error){box.innerHTML=`<p class="muted">Unable to load the review queue: ${esc(docsResult.error.message)}</p>`;return}
  if(clientsResult.error){box.innerHTML=`<p class="muted">Unable to load clients for review: ${esc(clientsResult.error.message)}</p>`;return}
  const docs=docsResult.data??[],clients=clientsResult.data??[],years=financialYears();
  if(!docs.length){box.innerHTML=`<div class="review-empty"><strong>No documents are awaiting review.</strong><p class="muted">New files requiring manual classification will appear here.</p></div>`;return}
  box.innerHTML=docs.map(d=>`<article class="review-card" data-review-row="${esc(d.id)}"><div class="review-card-head"><div><span class="file-icon">${esc((d.original_filename.split(".").pop()||"FILE").toUpperCase())}</span><strong>${esc(d.original_filename)}</strong><p class="muted">Uploaded ${d.created_at?new Date(d.created_at).toLocaleString():"—"}</p></div><span class="pill neutral">Review required</span></div><div class="review-meta"><div><span>Current area</span><strong>${esc(areaLabel(d.area||"other"))}</strong></div><div><span>Financial year</span><strong>${esc(d.financial_year||"Not classified")}</strong></div><div><span>Period</span><strong>${esc(d.filing_period||"Not classified")}</strong></div></div><div class="review-form"><label>Client<select data-field="client"><option value="">Select client…</option>${clients.map(c=>`<option value="${esc(c.id)}" ${c.id===d.client_id?"selected":""}>${esc(c.display_name||c.legal_name)}</option>`).join("")}</select></label><label>Area<select data-field="area"><option value="">Select area…</option>${AREAS.map(a=>`<option value="${a}" ${a===d.area?"selected":""}>${areaLabel(a)}</option>`).join("")}</select></label><label>Financial year<select data-field="financial-year"><option value="">Select financial year…</option>${years.map(y=>`<option value="${y}" ${y===d.financial_year?"selected":""}>FY ${y}</option>`).join("")}</select></label><label>Period<select data-field="period"><option value="">${d.area==="tds"?"Select quarter…":"Select month…"}</option>${d.area==="tds"?["Q1","Q2","Q3","Q4"].map(p=>`<option value="${p}" ${p===d.filing_period?"selected":""}>${p}</option>`).join(""):MONTHS.map(([v,l])=>`<option value="${v}" ${v===d.filing_period?"selected":""}>${l}</option>`).join("")}</select></label></div><div class="review-actions"><button class="secondary" data-action="reject">Reject</button><button class="primary" data-action="accept">Accept &amp; classify</button></div></article>`).join("");
  box.querySelectorAll("[data-review-row]").forEach(row=>{
    const areaSelect=row.querySelector("[data-field=area]"),periodSelect=row.querySelector("[data-field=period]");
    areaSelect?.addEventListener("change",()=>{
      const area=areaSelect.value;
      periodSelect.innerHTML=`<option value="">${area==="tds"?"Select quarter…":area==="gst"||area==="other"?"Select month…":"No period required"}</option>${area==="tds"?["Q1","Q2","Q3","Q4"].map(p=>`<option value="${p}">${p}</option>`).join(""):area==="gst"||area==="other"?MONTHS.map(([v,l])=>`<option value="${v}">${l}</option>`).join(""):""}`;
      periodSelect.disabled=!["gst","tds","other"].includes(area);
    });
    if(areaSelect&&periodSelect){periodSelect.disabled=!["gst","tds","other"].includes(areaSelect.value)}
    row.querySelectorAll("[data-action]").forEach(b=>b.addEventListener("click",()=>resolveItem(row.dataset.reviewRow,b.dataset.action)));
  });
}

document.addEventListener("click",async e=>{
  const link=e.target.closest('a[data-view="review"]');
  if(!link||!document.querySelector(".portal-main"))return;
  e.preventDefault();e.stopPropagation();
  if(!await loadIdentity()){return}
  await render();
},true);
