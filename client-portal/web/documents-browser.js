import { createClient as createSupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

const supabase=createSupabaseClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
const esc=v=>String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
const AREA_LABELS={gst:"GST",tds:"TDS",income_tax:"Income Tax",accounts:"Accounts",mca:"MCA",other:"Other"};
const MONTHS={"01":"January","02":"February","03":"March","04":"April","05":"May","06":"June","07":"July","08":"August","09":"September","10":"October","11":"November","12":"December"};
let clients=[],docs=[],nodes=[],selectedClientId="",liveChannel=null,opened={level:"subjects",subject:null,fy:null,period:null};

const clientLabel=c=>c?.display_name||c?.legal_name||"Unnamed client";
const nodeById=id=>nodes.find(n=>n.id===id);
const children=id=>nodes.filter(n=>n.parent_id===id).sort((a,b)=>a.sort_order-b.sort_order||String(a.name).localeCompare(String(b.name)));
const subjects=()=>nodes.filter(n=>n.node_type==="subject").sort((a,b)=>a.sort_order-b.sort_order||String(a.name).localeCompare(String(b.name)));
const areaLabel=a=>AREA_LABELS[String(a||"other").toLowerCase()]||"Other";
const periodLabel=(area,p)=>{if(!p)return"";if(area==="gst"||area==="other")return MONTHS[String(p).padStart(2,"0")]||String(p);return String(p)};
const docArea=d=>String(d.area||"other").toLowerCase();

async function session(){
  const {data:{session}}=await supabase.auth.getSession();
  if(!session?.access_token)throw new Error("Your session has expired. Please sign in again.");
  return session;
}
async function openDocument(id){
  const doc=docs.find(d=>d.id===id);if(!doc)throw new Error("Document is no longer available. Refresh and try again.");
  const s=await session();
  const r=await fetch(SUPABASE_URL+"/functions/v1/document-view?documentId="+encodeURIComponent(id),{headers:{Authorization:"Bearer "+s.access_token,apikey:SUPABASE_PUBLISHABLE_KEY}});
  if(!r.ok){const text=await r.text().catch(()=>"");throw new Error(text||"The document could not be opened.");}
  const bytes=await r.arrayBuffer();if(!bytes.byteLength)throw new Error("The document response was empty.");
  const type=(r.headers.get("Content-Type")||doc.content_type||"application/octet-stream").split(";")[0].toLowerCase();
  const blob=new Blob([bytes],{type}),url=URL.createObjectURL(blob);
  const tab=window.open("about:blank","_blank","noopener,noreferrer");
  if(!tab){URL.revokeObjectURL(url);throw new Error("The browser blocked the document tab. Allow pop-ups for the KKA portal.");}
  tab.opener=null;tab.location.replace(url);setTimeout(()=>URL.revokeObjectURL(url),120000);
}
async function downloadDocument(id){
  const doc=docs.find(d=>d.id===id);if(!doc)throw new Error("Document is no longer available. Refresh and try again.");
  const s=await session();
  const r=await fetch(SUPABASE_URL+"/functions/v1/client-document-access",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+s.access_token},body:JSON.stringify({documentId:id,action:"download_stream"})});
  if(!r.ok){const d=await r.json().catch(()=>({}));throw new Error(d.error||"The document could not be downloaded.");}
  const blob=await r.blob(),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=doc.original_filename||"document";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),120000);
}

async function load(){
  if(!selectedClientId){docs=[];nodes=[];return;}
  const nodeResult=await supabase.from("filing_nodes").select("id,parent_id,name,slug,node_type,enabled,client_upload_enabled,requires_financial_year,period_mode,sort_order").eq("enabled",true).order("sort_order").order("name");
  if(nodeResult.error)throw nodeResult.error;nodes=nodeResult.data||[];
  const pageSize=500;let offset=0,all=[];
  while(true){
    const r=await supabase.from("documents").select("id,client_id,original_filename,content_type,area,financial_year,filing_period,filing_node_id,status,byte_size,created_at,deleted_at").eq("client_id",selectedClientId).eq("status","accepted").is("deleted_at",null).order("created_at",{ascending:false}).order("id",{ascending:false}).range(offset,offset+pageSize-1);
    if(r.error)throw r.error;const page=r.data||[];all.push(...page);offset+=page.length;if(page.length<pageSize)break;
  }
  docs=all;
}
async function stopLiveRefresh(){const old=liveChannel;liveChannel=null;if(old){try{await supabase.removeChannel(old)}catch{}}}
async function startLiveRefresh(){await stopLiveRefresh();if(!selectedClientId)return;liveChannel=supabase.channel("kka-documents-browser-"+selectedClientId).on("postgres_changes",{event:"*",schema:"public",table:"documents",filter:"client_id=eq."+selectedClientId},async()=>{try{await load();draw()}catch(e){console.warn("document live refresh",e)}}).subscribe();}
function clientMatches(c,term){if(!term)return true;const q=term.trim().toLowerCase();return [c.display_name,c.legal_name,c.cin,c.pan,c.gstin].filter(Boolean).some(v=>String(v).toLowerCase().includes(q));}
function drawClientPicker(){
  const input=document.querySelector("#browser-client-search"),results=document.querySelector("#browser-client-results");if(!input||!results)return;
  const term=input.dataset.term||"";const matches=clients.filter(c=>clientMatches(c,term)).slice(0,40);
  results.innerHTML=matches.length?matches.map(c=>'<button type="button" class="browser-client-option '+(c.id===selectedClientId?"active":"")+'" data-client-id="'+esc(c.id)+'"><strong>'+esc(clientLabel(c))+'</strong>'+(c.cin?'<small class="muted">CIN '+esc(c.cin)+'</small>':"")+"</button>").join(""):'<div class="browser-client-empty">No active client matches.</div>';
  results.classList.toggle("open",!!term||!selectedClientId);
  results.querySelectorAll("[data-client-id]").forEach(b=>b.addEventListener("click",async()=>{selectedClientId=b.dataset.clientId;opened={level:"subjects",subject:null,fy:null,period:null};input.dataset.term="";input.value=clientLabel(clients.find(c=>c.id===selectedClientId));results.classList.remove("open");try{await load();draw();await startLiveRefresh()}catch(e){showError(e.message||"Documents could not be loaded.");}}));
}
function nodeChain(id){const out=[];let cur=id;while(cur&&out.length<20){const n=nodeById(cur);if(!n)break;out.unshift(n);cur=n.parent_id;}return out;}
function docsForSubject(subject){return docs.filter(d=>docArea(d)===String(subject.slug||"").replace(/-/g,"_")||d.filing_node_id&&nodeChain(d.filing_node_id).some(n=>n.id===subject.id));}
function subjectDocs(subject){const byNode=new Map();docs.filter(d=>{const chain=nodeChain(d.filing_node_id);return chain.some(n=>n.id===subject.id)||docArea(d)===String(subject.slug||"").replace(/-/g,"_")}).forEach(d=>{const key=d.id;byNode.set(key,d)});return [...byNode.values()];}
function yearsFor(subject){return [...new Set(subjectDocs(subject).map(d=>d.financial_year).filter(Boolean))].sort((a,b)=>String(b).localeCompare(String(a)));}
function periodsFor(subject,fy){return [...new Set(subjectDocs(subject).filter(d=>d.financial_year===fy).map(d=>d.filing_period).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b)));}
function filesFor(subject,fy,period){return subjectDocs(subject).filter(d=>d.financial_year===fy&&(!period||d.filing_period===period)).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));}

function renderFiles(list){
  if(!list.length)return '<div class="browser-empty"><strong>No documents in this folder</strong><span>Accepted documents will appear here.</span></div>';
  return '<div class="browser-file-list">'+list.map(d=>'<div class="browser-doc"><div class="browser-doc-main"><span class="browser-file-type">'+esc((d.original_filename||"FILE").split(".").pop()?.slice(0,5).toUpperCase()||"FILE")+'</span><div><strong title="'+esc(d.original_filename)+'">'+esc(d.original_filename)+'</strong><small class="muted">'+esc(d.filing_period?periodLabel(d.area,d.filing_period):"No period")+' · '+esc(d.content_type||"file")+' · '+formatBytes(d.byte_size)+'</small></div></div><div class="browser-doc-actions"><button class="secondary table-action" type="button" data-open="'+esc(d.id)+'">Open</button><button class="secondary table-action" type="button" data-download="'+esc(d.id)+'">Download</button></div></div>').join("")+'</div>';
}
function draw(){
  const tree=document.querySelector("#folder-tree"),list=document.querySelector("#browser-documents"),crumb=document.querySelector("#browser-breadcrumb");if(!tree||!list)return;
  const client=clients.find(c=>c.id===selectedClientId);if(!client){tree.innerHTML='<div class="browser-empty">Search and select a client.</div>';list.innerHTML="";crumb.innerHTML="";return;}
  const sub=subjects().filter(s=>s.slug!=="mca"||!!client.cin);
  if(opened.level==="subjects"){
    crumb.innerHTML='<span class="browser-current">Folders</span>';
    tree.innerHTML=sub.map(s=>'<button type="button" class="browser-folder" data-subject="'+esc(s.id)+'"><span class="browser-folder-icon">›</span><span><strong>'+esc(s.name)+'</strong><small>'+subjectDocs(s).length+' document'+(subjectDocs(s).length===1?"":"s")+'</small></span></button>').join("");
    list.innerHTML="";return;
  }
  const subject=nodeById(opened.subject);if(!subject){opened={level:"subjects"};return draw();}
  const years=yearsFor(subject);
  if(opened.level==="years"){
    crumb.innerHTML='<button type="button" class="browser-back" data-back>‹ Folders</button><span>/</span><strong>'+esc(subject.name)+'</strong>';
    tree.innerHTML=years.length?years.map(y=>'<button type="button" class="browser-folder" data-year="'+esc(y)+'"><span class="browser-folder-icon">›</span><span><strong>FY '+esc(y)+'</strong><small>'+subjectDocs(subject).filter(d=>d.financial_year===y).length+' document(s)</small></span></button>').join(""):'<div class="browser-empty">No financial years yet.</div>';
    list.innerHTML="";return;
  }
  const fy=opened.fy;
  const periods=periodsFor(subject,fy);
  const needsPeriod=String(subject.slug||"").toLowerCase()==="gst"||String(subject.slug||"").toLowerCase()==="tds"||String(subject.slug||"").toLowerCase()==="other";
  if(opened.level==="periods"&&needsPeriod){
    crumb.innerHTML='<button type="button" class="browser-back" data-back>‹ '+esc(subject.name)+'</button><span>/</span><strong>FY '+esc(fy)+'</strong>';
    tree.innerHTML=periods.length?periods.map(p=>'<button type="button" class="browser-folder" data-period="'+esc(p)+'"><span class="browser-folder-icon">›</span><span><strong>'+esc(periodLabel(subject.slug==="gst"?"gst":subject.slug==="other"?"other":"tds",p))+'</strong><small>'+subjectDocs(subject).filter(d=>d.financial_year===fy&&d.filing_period===p).length+' document(s)</small></span></button>').join(""):'<div class="browser-empty">No periods yet.</div>';
    list.innerHTML="";return;
  }
  const visible=needsPeriod?filesFor(subject,fy,opened.period):filesFor(subject,fy,null);
  crumb.innerHTML='<button type="button" class="browser-back" data-back>‹ '+esc(needsPeriod?(periodLabel(subject.slug==="gst"?"gst":subject.slug==="tds"?"tds":"other",opened.period||"")||"FY "+fy):subject.name)+'</button><span>/</span><strong>'+esc(needsPeriod&&opened.period?periodLabel(subject.slug==="gst"?"gst":subject.slug==="tds"?"tds":"other",opened.period):"FY "+fy)+'</strong>';
  tree.innerHTML="";list.innerHTML=renderFiles(visible);
}
function showError(message){const main=document.querySelector(".portal-main");if(main&&!document.querySelector("#documents-browser-panel"))main.insertAdjacentHTML("beforeend",'<section class="panel" id="documents-browser-panel"><p class="muted">'+esc(message)+'</p></section>');}
function formatBytes(n){n=Number(n)||0;if(n<1024)return n+" B";if(n<1048576)return (n/1024).toFixed(1)+" KB";if(n<1073741824)return (n/1048576).toFixed(1)+" MB";return (n/1073741824).toFixed(2)+" GB";}
function renderPanel(staff){
  const main=document.querySelector(".portal-main");if(!main||document.querySelector("#documents-browser-panel"))return;
  const style='<style id="documents-browser-style">.folder-browser{margin-bottom:18px}.folder-toolbar{display:flex;gap:12px;align-items:end;flex-wrap:wrap}.browser-client-picker{position:relative;min-width:320px}.browser-client-picker input{width:100%;box-sizing:border-box}.browser-client-results{display:none;position:absolute;z-index:30;left:0;right:0;top:calc(100% + 6px);max-height:320px;overflow:auto;background:var(--surface,#fff);border:1px solid var(--border,#ddd);border-radius:10px;box-shadow:0 12px 28px rgba(0,0,0,.12);padding:6px}.browser-client-results.open{display:block}.browser-client-option{display:block;width:100%;border:0;background:transparent;text-align:left;padding:10px 11px;border-radius:8px;cursor:pointer;font:inherit}.browser-client-option:hover,.browser-client-option.active{background:var(--surface-muted,#f3f4f6)}.browser-client-option strong,.browser-client-option small{display:block}.browser-client-option small{margin-top:3px}.folder-tree{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px;margin-top:18px}.browser-folder{border:1px solid var(--border,#ddd);border-radius:12px;background:var(--surface,#fff);padding:14px;text-align:left;display:flex;align-items:center;gap:12px;cursor:pointer;font:inherit}.browser-folder:hover{border-color:currentColor}.browser-folder-icon{width:26px;height:26px;border:1px solid var(--border,#ddd);border-radius:7px;display:grid;place-items:center;flex:none}.browser-folder strong{display:block}.browser-folder small{display:block;margin-top:4px;color:var(--muted,#666)}.browser-breadcrumb,.browser-current{font-size:12px}.browser-back{border:0;background:transparent;padding:0;cursor:pointer;font:inherit}.browser-documents{margin-top:18px}.browser-file-list{border:1px solid var(--border,#ddd);border-radius:12px;overflow:hidden}.browser-doc{display:flex;justify-content:space-between;align-items:center;gap:14px;padding:12px 14px;border-bottom:1px solid var(--border,#ddd)}.browser-doc:last-child{border-bottom:0}.browser-doc-main{display:flex;align-items:center;gap:10px;min-width:0;flex:1}.browser-doc-main strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.browser-file-type{width:38px;height:38px;border:1px solid var(--border,#ddd);border-radius:8px;display:grid;place-items:center;font-size:9px;font-weight:800;flex:none}.browser-doc-actions{display:flex;gap:6px;flex:none}.browser-empty{padding:22px;border:1px dashed var(--border,#ddd);border-radius:10px}.browser-empty strong,.browser-empty span{display:block}.browser-empty span{margin-top:4px;color:var(--muted,#666)}.browser-back{color:inherit}@media(max-width:650px){.browser-client-picker{min-width:100%}.browser-doc{display:block}.browser-doc-main strong{white-space:normal}.browser-doc-actions{margin-top:9px}.browser-doc-actions button{flex:1}}</style>';
  main.insertAdjacentHTML("beforeend",style+'<section class="panel folder-browser" id="documents-browser-panel"><div class="panel-head"><div><p class="eyebrow">DOCUMENT LIBRARY</p><h2>Client folders</h2><p class="muted">Browse the same filing hierarchy used by KKA storage. Files update live when accepted or changed.</p></div></div><div class="folder-toolbar">'+(staff?'<label>Client<div class="browser-client-picker"><input id="browser-client-search" type="search" autocomplete="off" placeholder="Search client by name, PAN, GSTIN or CIN" aria-label="Search client"><div id="browser-client-results" class="browser-client-results"></div></div></label>':'')+'</div><div id="folder-tree" class="folder-tree"></div><div id="browser-breadcrumb" class="browser-breadcrumb"></div><div id="browser-documents" class="browser-documents"></div></section>');
  const input=document.querySelector("#browser-client-search");if(input){input.addEventListener("focus",()=>{input.dataset.term="";input.value="";drawClientPicker()});input.addEventListener("input",()=>{input.dataset.term=input.value;drawClientPicker()});input.addEventListener("keydown",e=>{if(e.key==="Escape"){input.dataset.term="";input.value=clientLabel(clients.find(c=>c.id===selectedClientId));input.blur();document.querySelector("#browser-client-results")?.classList.remove("open")}});document.addEventListener("click",e=>{if(!e.target.closest(".browser-client-picker"))document.querySelector("#browser-client-results")?.classList.remove("open")});}
  document.querySelector("#documents-browser-panel").addEventListener("click",async e=>{const back=e.target.closest("[data-back]");if(back){if(opened.level==="files"){opened=opened.period?{level:"periods",subject:opened.subject,fy:opened.fy}: {level:"years",subject:opened.subject}}else if(opened.level==="periods")opened={level:"years",subject:opened.subject};else opened={level:"subjects"};draw();return}const s=e.target.closest("[data-subject]");if(s){opened={level:"years",subject:s.dataset.subject};draw();return}const y=e.target.closest("[data-year]");if(y){const subject=nodeById(opened.subject);const needs=String(subject?.slug||"").toLowerCase()==="gst"||String(subject?.slug||"").toLowerCase()==="tds"||String(subject?.slug||"").toLowerCase()==="other";opened=needs?{level:"periods",subject:opened.subject,fy:y.dataset.year}:{level:"files",subject:opened.subject,fy:y.dataset.year,period:null};draw();return}const p=e.target.closest("[data-period]");if(p){opened={level:"files",subject:opened.subject,fy:opened.fy,period:p.dataset.period};draw();return}const o=e.target.closest("[data-open]");if(o){try{await openDocument(o.dataset.open)}catch(err){alert(err.message||"The document could not be opened.")}return}const d=e.target.closest("[data-download]");if(d){try{await downloadDocument(d.dataset.download)}catch(err){alert(err.message||"The document could not be downloaded.")}}});
}
async function loadClients(staff){
  if(staff){const r=await supabase.from("clients").select("id,legal_name,display_name,cin,pan,gstin,tan").eq("active",true).order("legal_name");if(r.error)throw r.error;clients=r.data||[];selectedClientId=clients.length===1?clients[0].id:"";}
  else{const {data:{user}}=await supabase.auth.getUser();const m=await supabase.from("client_memberships").select("client_id").eq("user_id",user.id).limit(1).maybeSingle();if(m.error||!m.data)throw new Error("No client profile is linked to this login.");const r=await supabase.from("clients").select("id,legal_name,display_name,cin,pan,gstin,tan").eq("id",m.data.client_id).eq("active",true).maybeSingle();if(r.error||!r.data)throw new Error("The linked client profile could not be loaded.");clients=[r.data];selectedClientId=r.data.id;}
}
async function loadRenderer(){if(document.querySelector("#documents-browser-panel"))return;const {data:{user}}=await supabase.auth.getUser();if(!user)return;const p=await supabase.from("profiles").select("role").eq("id",user.id).maybeSingle();const staff=["admin","staff"].includes(p.data?.role);try{await loadClients(staff);renderPanel(staff);if(staff)drawClientPicker();await load();draw();await startLiveRefresh();}catch(e){showError(e.message||"Documents could not be loaded.");}}
window.KKADocumentsBrowserRender=loadRenderer;
window.KKADocumentsBrowserStop=stopLiveRefresh;
