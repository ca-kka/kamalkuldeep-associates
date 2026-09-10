import { createClient as createSupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

const supabase=createSupabaseClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
const esc=v=>String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
const areas=["gst","tds","income_tax","accounts","mca","other"];
const labels={gst:"GST",tds:"TDS",income_tax:"Income Tax",accounts:"Accounts",mca:"MCA",other:"Other"};
const months={"01":"January","02":"February","03":"March","04":"April","05":"May","06":"June","07":"July","08":"August","09":"September","10":"October","11":"November","12":"December"};
let clients=[],docs=[],selectedClientId="",scope={area:null,fy:null,period:null};

function clientLabel(c){return c.display_name||c.legal_name||"Unnamed client"}
function fySort(a,b){return String(b).localeCompare(String(a))}
function periodLabel(area,p){if(!p)return "";return area==="gst"?(months[p]||p):p}
function currentFY(){const d=new Date(),y=d.getFullYear();return `${d.getMonth()+1>=4?y:y-1}-${String((d.getMonth()+1>=4?y:y-1)+1).slice(2)}`}

async function load(){
  const main=document.querySelector(".portal-main");
  if(!main||document.querySelector("#documents-browser-panel"))return;
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return;
  const {data:profile}=await supabase.from("profiles").select("role").eq("id",user.id).maybeSingle();
  const staff=["admin","staff"].includes(profile?.role);
  if(staff){
    const r=await supabase.from("clients").select("id,legal_name,display_name,cin").eq("active",true).order("legal_name");
    if(r.error)return showError("Client folders could not be loaded.");
    clients=r.data||[];
  }else{
    const m=await supabase.from("client_memberships").select("client_id").eq("user_id",user.id).limit(1).maybeSingle();
    if(m.error||!m.data)return showError("No client profile is linked to this login.");
    const r=await supabase.from("clients").select("id,legal_name,display_name,cin").eq("id",m.data.client_id).eq("active",true).maybeSingle();
    if(r.error||!r.data)return showError("The linked client profile could not be loaded.");
    clients=[r.data];
  }
  selectedClientId=clients.length===1?clients[0].id:"";
  const r=await supabase.from("documents").select("id,client_id,original_filename,area,financial_year,filing_period,status,byte_size,content_type,created_at,storage_path").order("created_at",{ascending:false}).limit(1000);
  if(r.error)return showError("Documents could not be loaded.");
  docs=r.data||[];
  renderPanel(staff);
}

function renderPanel(staff){
  const main=document.querySelector(".portal-main");
  if(!main||document.querySelector("#documents-browser-panel"))return;
  const style=`<style id="documents-browser-style">.folder-browser{margin-bottom:18px}.folder-toolbar{display:flex;gap:12px;align-items:end;flex-wrap:wrap}.folder-toolbar label{min-width:260px}.folder-tree{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin-top:18px}.folder-card{border:1px solid var(--border,#ddd);border-radius:12px;padding:15px;background:var(--surface,#fff);cursor:pointer;text-align:left}.folder-card:hover,.folder-card.active{border-color:currentColor}.folder-card strong{display:block;font-size:16px}.folder-card small{display:block;margin-top:5px}.folder-children{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.folder-child{border:1px solid var(--border,#ddd);background:transparent;border-radius:8px;padding:7px 10px;cursor:pointer}.folder-child.active{font-weight:700}.document-browser-list{margin-top:18px}.browser-empty{padding:20px;border:1px dashed var(--border,#ddd);border-radius:10px}.browser-doc{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:12px;align-items:center;padding:13px 0;border-bottom:1px solid var(--border,#ddd)}.browser-doc strong{display:block}.browser-doc small{display:block;margin-top:4px}.browser-breadcrumb{margin-top:14px}.browser-back{margin-bottom:10px}@media(max-width:650px){.browser-doc{grid-template-columns:1fr}.folder-toolbar label{min-width:100%}}</style>`;
  const html=`${style}<section class="panel folder-browser" id="documents-browser-panel"><div class="panel-head"><div><p class="eyebrow">DOCUMENT LIBRARY</p><h2>Client folders</h2><p class="muted">Browse documents using KKA's filing structure. MCA appears automatically for clients with a CIN.</p></div></div><div class="folder-toolbar">${staff?`<label>Client<select id="browser-client"><option value="">Select client</option>${clients.map(c=>`<option value="${esc(c.id)}">${esc(clientLabel(c))}${c.cin?` · CIN ${esc(c.cin)}`:""}</option>`).join("")}</select></label>`:`<div><strong>${esc(clientLabel(clients[0]))}</strong>${clients[0]?.cin?`<small class="muted"> · CIN ${esc(clients[0].cin)}</small>`:""}</div>`}</div><div id="folder-tree" class="folder-tree"></div><div id="browser-breadcrumb" class="browser-breadcrumb"></div><div id="browser-documents" class="document-browser-list"></div></section>`;
  main.insertAdjacentHTML("beforeend",html);
  const sel=document.querySelector("#browser-client");
  if(sel){sel.value=selectedClientId;sel.addEventListener("change",()=>{selectedClientId=sel.value;scope={area:null,fy:null,period:null};drawBrowser()})}
  drawBrowser();
}

function showError(message){const main=document.querySelector(".portal-main");if(main&&!document.querySelector("#documents-browser-panel"))main.insertAdjacentHTML("beforeend",`<section class="panel" id="documents-browser-panel"><p class="muted">${esc(message)}</p></section>`)}
function clientDocs(){return docs.filter(d=>d.client_id===selectedClientId)}
function areaDocs(area){return clientDocs().filter(d=>d.area===area)}
function fys(area){return [...new Set(areaDocs(area).map(d=>d.financial_year).filter(Boolean))].sort(fySort)}
function drawBrowser(){
  const tree=document.querySelector("#folder-tree"),list=document.querySelector("#browser-documents"),crumb=document.querySelector("#browser-breadcrumb");if(!tree||!list)return;
  const client=clients.find(c=>c.id===selectedClientId);if(!client){tree.innerHTML=`<p class="muted">Select a client to browse its folders.</p>`;list.innerHTML="";crumb.innerHTML="";return}
  tree.innerHTML=areas.filter(a=>a!=="mca"||!!client.cin).map(area=>{const count=areaDocs(area).length,years=fys(area),active=scope.area===area;return `<button class="folder-card ${active?"active":""}" type="button" data-area="${area}"><strong>▰ ${labels[area]}</strong><small class="muted">${count} document${count===1?"":"s"}${area==="gst"?" · FY → Month":area==="tds"?" · FY → Quarter":area==="mca"?" · FY":" · FY"}</small>${active&&years.length?`<span class="folder-children">${years.map(y=>`<button type="button" class="folder-child ${scope.fy===y?"active":""}" data-fy="${esc(y)}">FY ${esc(y)}</button>`).join("")}</span>`:""}</button>`}).join("");
  tree.querySelectorAll("[data-area]").forEach(b=>b.addEventListener("click",e=>{if(e.target.closest("[data-fy]"))return;scope={area:b.dataset.area,fy:null,period:null};drawBrowser()}));
  tree.querySelectorAll("[data-fy]").forEach(b=>b.addEventListener("click",e=>{e.stopPropagation();scope.fy=b.dataset.fy;scope.period=null;drawBrowser()}));
  if(!scope.area){crumb.innerHTML=`<p class="muted">${esc(clientLabel(client))} · Select a main folder.</p>`;list.innerHTML="";return}
  const selected=areaDocs(scope.area).filter(d=>!scope.fy||d.financial_year===scope.fy);
  let periods=[];
  if(scope.fy&&scope.area==="gst")period=[...new Set(selected.map(d=>d.filing_period).filter(Boolean))].sort();
  else if(scope.fy&&scope.area==="tds")periods=[...new Set(selected.map(d=>d.filing_period).filter(Boolean))].sort();
  crumb.innerHTML=`<p><strong>${esc(clientLabel(client))}</strong> → <strong>${labels[scope.area]}</strong>${scope.fy?` → FY ${esc(scope.fy)}`:""}</p>`;
  if(scope.fy&&["gst","tds"].includes(scope.area)&&periods.length){list.innerHTML=`<div class="folder-children">${periods.map(p=>`<button type="button" class="folder-child ${scope.period===p?"active":""}" data-period="${esc(p)}">${esc(periodLabel(scope.area,p))}</button>`).join("")}</div>`;list.querySelectorAll("[data-period]").forEach(b=>b.addEventListener("click",()=>{scope.period=b.dataset.period;drawBrowser()}));}
  else if(scope.fy&&["gst","tds"].includes(scope.area))list.innerHTML=`<div class="browser-empty"><p>No documents are stored for this FY yet.</p></div>`;
  const visible=selected.filter(d=>!scope.period||d.filing_period===scope.period);
  if(scope.area&&scope.fy&&(scope.area==="mca"||!["gst","tds"].includes(scope.area))||scope.period){
    list.insertAdjacentHTML("beforeend",visible.length?visible.map(d=>`<div class="browser-doc"><div><strong>${esc(d.original_filename)}</strong><small class="muted">${esc(d.area.toUpperCase())}${d.financial_year?` · FY ${esc(d.financial_year)}`:""}${d.filing_period?` · ${esc(periodLabel(d.area,d.filing_period))}`:""}</small></div><span class="pill ${d.status==="accepted"?"success":"neutral"}">${esc(d.status)}</span><small class="muted">${formatBytes(d.byte_size)}</small></div>`).join(""):`<div class="browser-empty"><p>No documents in this folder yet.</p></div>`);
  }
}
function formatBytes(n){if(n<1024)return`${n} B`;if(n<1048576)return`${(n/1024).toFixed(1)} KB`;if(n<1073741824)return`${(n/1048576).toFixed(1)} MB`;return`${(n/1073741824).toFixed(2)} GB`}

const observer=new MutationObserver(()=>{const main=document.querySelector(".portal-main");if(main&&!document.querySelector("#documents-browser-panel")&&document.querySelector("#drop-zone"))load()});observer.observe(document.body,{childList:true,subtree:true});
load();
