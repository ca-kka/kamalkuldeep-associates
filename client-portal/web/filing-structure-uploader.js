import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";
const supabase=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);const MAX_BYTES=50*1024*1024;let nodes=[];
const esc=v=>String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
const months=["01|January","02|February","03|March","04|April","05|May","06|June","07|July","08|August","09|September","10|October","11|November","12|December"];
const currentFY=(()=>{const n=new Date(),y=n.getFullYear();return n.getMonth()+1>=4?y:y-1})();const fys=Array.from({length:10},(_,i)=>{const y=currentFY-i;return `${y}-${String(y+1).slice(2)}`});
async function token(){const {data:{session}}=await supabase.auth.getSession();if(!session?.access_token)throw new Error("Your session has expired. Please sign in again.");return session.access_token}
async function load(){const {data,error}=await supabase.rpc("get_filing_structure");if(error)throw error;nodes=Array.isArray(data)?data.filter(n=>n.enabled):[];return nodes}
const children=id=>nodes.filter(n=>n.parent_id===id).sort((a,b)=>a.sort_order-b.sort_order||a.name.localeCompare(b.name));
const subjectNodes=()=>nodes.filter(n=>n.node_type==="subject").sort((a,b)=>a.sort_order-b.sort_order||a.name.localeCompare(b.name));
const nodeById=id=>nodes.find(n=>n.id===id);
function subjectOptions(){return `<option value="">Select filing subject</option>${subjectNodes().map(n=>`<option value="${esc(n.id)}">${esc(n.name)}</option>`).join("")}`}
function folderOptions(subjectId){const list=children(subjectId);if(!subjectId)return `<option value="">Select subject first</option>`;if(!list.length)return `<option value="">No sub-folder required</option>`;return `<option value="">Select sub-folder</option>${list.map(n=>`<option value="${esc(n.id)}">${esc(n.name)}</option>`).join("")}`}
function periodOptions(mode){if(mode==="month")return `<option value="">Select month</option>${months.map(x=>{const [v,n]=x.split("|");return `<option value="${v}">${n}</option>`}).join("")}`;if(mode==="quarter")return `<option value="">Select quarter</option><option value="Q1">Q1 (Apr–Jun)</option><option value="Q2">Q2 (Jul–Sep)</option><option value="Q3">Q3 (Oct–Dec)</option><option value="Q4">Q4 (Jan–Mar)</option>`;return `<option value="">No period required</option>`}
function ensurePeriodInput(mode){const current=document.querySelector("#manual-period");if(!current)return;if(mode==="custom"){if(current.tagName!=="INPUT")current.outerHTML=`<input id="manual-period" placeholder="Enter period" maxlength="80">`;return}if(current.tagName!=="SELECT")current.outerHTML=`<select id="manual-period"><option value="">No period required</option></select>`;const period=document.querySelector("#manual-period");period.innerHTML=periodOptions(mode)}
function replaceUI(){const area=document.querySelector("#manual-area"),fy=document.querySelector("#manual-fy"),period=document.querySelector("#manual-period");if(!area||!fy||!period)return false;const label=area.closest("label");if(label){label.style.display="none";label.insertAdjacentHTML("afterend",`<label id="manual-filing-subject-label">Filing subject<select id="manual-filing-subject">${subjectOptions()}</select></label><label id="manual-filing-folder-label">Sub-folder<select id="manual-filing-folder" disabled><option value="">Select subject first</option></select></label>`)}const subject=document.querySelector("#manual-filing-subject"),folder=document.querySelector("#manual-filing-folder");if(!subject||!folder)return false;const updateFromSelection=()=>update();subject.addEventListener("change",()=>{folder.innerHTML=folderOptions(subject.value);folder.disabled=!subject.value||children(subject.value).length===0;updateFromSelection()});folder.addEventListener("change",updateFromSelection);fy.innerHTML=`<option value="">Select financial year</option>${fys.map(f=>`<option value="${f}">FY ${f}</option>`).join("")}`;period.innerHTML=periodOptions("none");period.disabled=true;update();return true}
function syncLegacy(n){const area=document.querySelector("#manual-area");if(!area)return;const map={gst:"gst",tds:"tds","income-tax":"income_tax",accounts:"accounts",mca:"mca",other:"other"};const subject=n?.node_type==="subject"?n:n?.parent_id?nodeById(n.parent_id):null;area.value=map[subject?.slug]||"other";area.dispatchEvent(new Event("change",{bubbles:true}));area.disabled=true}
function selectedStructure(){const subject=nodeById(document.querySelector("#manual-filing-subject")?.value);const folder=nodeById(document.querySelector("#manual-filing-folder")?.value);return{subject,folder,node:folder||subject}}
function update(){
  const fy=document.querySelector("#manual-fy");
  const period=document.querySelector("#manual-period");
  const client=document.querySelector("#manual-client");
  const upload=document.querySelector("#manual-upload");
  const summary=document.querySelector("#manual-summary");
  const subjectEl=document.querySelector("#manual-filing-subject");
  const folderEl=document.querySelector("#manual-filing-folder");
  if(!fy||!period||!summary||!subjectEl||!folderEl)return;

  const selected=selectedStructure();
  const subject=selected.subject;
  const folder=selected.folder;
  const effective=selected.node;
  const needsFY=!!effective?.requires_financial_year;
  const mode=effective?.period_mode||"none";

  syncLegacy(effective);
  const hasChildren=!!subject&&children(subject.id).length>0;
  folderEl.disabled=!subject||!hasChildren;

  fy.disabled=!effective||!needsFY;
  ensurePeriodInput(mode);

  const p=document.querySelector("#manual-period");
  p.disabled=!effective||mode==="none";
  if(mode==="none")p.value="";

  const files=window.__kkaManualFiles||[];
  const valid=!!client?.value&&!!subject&&(!hasChildren||!!folder)&&!!effective&&(!needsFY||!!fy?.value)&&(mode==="none"||!!p?.value)&&files.length>0;

  if(effective){
    const clientName=client?.selectedOptions?.[0]?.textContent||"Client";
    const subjectName=subject?.name||effective.name;
    const folderText=folder?" · "+folder.name:"";
    const fyText=fy?.value?" · FY "+fy.value:"";
    const periodText=p?.value?" · "+p.value:"";
    summary.textContent=clientName+" · "+subjectName+folderText+fyText+periodText;
  }else{
    summary.textContent="Select a client, filing subject and sub-folder where applicable.";
  }
  upload.disabled=!valid;
}
function contentTypeForFile(file){const types={pdf:"application/pdf",jpg:"image/jpeg",jpeg:"image/jpeg",png:"image/png",xlsx:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",xls:"application/vnd.ms-excel",csv:"text/csv"};return types[String(file.name.split(".").pop()||"").toLowerCase()]||null}
function formatBytes(n){if(n<1024)return `${n} B`;if(n<1048576)return `${(n/1024).toFixed(1)} KB`;return `${(n/1048576).toFixed(1)} MB`}
function filesUI(){const input=document.querySelector("#manual-file-input"),list=document.querySelector("#manual-file-list");if(!input||!list)return;input.addEventListener("change",()=>{window.__kkaManualFiles=[...(input.files||[])];list.innerHTML=window.__kkaManualFiles.map(f=>`<div class="manual-file"><strong>${esc(f.name)}</strong><span class="muted">${formatBytes(f.size)}</span></div>`).join("");update()})}
async function prepare(file,opts){const tokenValue=await token(),buf=await file.arrayBuffer(),hash=[...new Uint8Array(await crypto.subtle.digest("SHA-256",buf))].map(v=>v.toString(16).padStart(2,"0")).join("");const r=await fetch(`${SUPABASE_URL}/functions/v1/prepare-upload`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${tokenValue}`},body:JSON.stringify({filename:file.name,byteSize:file.size,contentType:contentTypeForFile(file),sha256:hash,manual:true,...opts})});const b=await r.json().catch(()=>({}));if(!r.ok)throw new Error(b.message||b.error||`Preparation failed (HTTP ${r.status})`);return{...b,hash}}
async function runUpload(){const fy=document.querySelector("#manual-fy"),period=document.querySelector("#manual-period"),client=document.querySelector("#manual-client"),message=document.querySelector("#manual-message"),files=window.__kkaManualFiles||[],{subject,folder,node}=selectedStructure();if(!subject||!node||!client?.value||!files.length)return;const valid=files.filter(f=>f.size>0&&f.size<=MAX_BYTES&&!!contentTypeForFile(f));message.textContent=`Preparing ${valid.length} manual file(s)…`;message.className="form-message";let done=0;const failures=[];for(const file of valid){try{const p=await prepare(file,{clientId:client.value,filingNodeId:node.id,area:subject.slug?.replace(/-/g,"_")||"other",financialYear:fy.value||null,period:period.value||null});if(p.state==="duplicate"){failures.push(`${file.name}: identical file already exists`);continue}const path=p.objectPath;if(!path)throw new Error("Upload preparation did not return a staging path.");const {data,error}=await supabase.storage.from("client-documents").uploadToSignedUrl(path,p.token,file,{contentType:contentTypeForFile(file)});if(error)throw error;const t=await token(),r=await fetch(`${SUPABASE_URL}/functions/v1/complete-upload`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${t}`},body:JSON.stringify({uploadId:p.uploadId})}),b=await r.json().catch(()=>({}));if(!r.ok)throw new Error(b.error||`Completion failed (HTTP ${r.status})`);done++}catch(e){failures.push(`${file.name}: ${e instanceof Error?e.message:"Upload failed"}`)}}if(failures.length){message.textContent=`${done} uploaded, ${failures.length} failed. ${failures.join(" | ")}`;message.className="form-message error"}else{message.textContent=`${done} file(s) uploaded successfully to ${node.name}.${files.length>valid.length?` ${files.length-valid.length} file(s) skipped because their format is unsupported, they are empty, or exceed 50 MB.`:""}`;message.className="form-message success";window.__kkaManualFiles=[];document.querySelector("#manual-file-input").value="";document.querySelector("#manual-file-list").innerHTML=""}update()}
function init(){if(!replaceUI())return false;filesUI();const old=document.querySelector("#manual-upload");if(old&&!old.dataset.filingUploadBound){old.dataset.filingUploadBound="1";old.addEventListener("click",runUpload)}document.querySelector("#manual-client")?.addEventListener("change",update);return true}
async function initialize(){await load();return init()}
window.KKAFilingStructureUploaderInit=initialize;
