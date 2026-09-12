import { createClient as createSupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

const supabase=createSupabaseClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
const esc=v=>String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
const fmtSize=n=>n<1024?`${n} B`:n<1048576?`${Math.ceil(n/1024)} KB`:`${(n/1048576).toFixed(1)} MB`;
const sha256=async file=>{const h=await crypto.subtle.digest("SHA-256",await file.arrayBuffer());return [...new Uint8Array(h)].map(v=>v.toString(16).padStart(2,"0")).join("")};
const session=async()=>{const {data:{session}}=await supabase.auth.getSession();return session?.access_token||null};

async function isClient(){
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return false;
  const {data:p}=await supabase.from("profiles").select("role,active").eq("id",user.id).maybeSingle();
  return p?.active===true&&p.role==="client";
}

async function getSelectedClient(){
  const id=localStorage.getItem("kka-selected-client");
  if(!id)return null;
  const {data,error}=await supabase.from("clients").select("id,display_name,legal_name,pan,gstin").eq("id",id).maybeSingle();
  if(error||!data)return null;
  return data;
}

async function hasUploadAccess(){
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return false;
  const {data:m}=await supabase.from("client_memberships").select("can_upload").eq("user_id",user.id).maybeSingle();
  return m?.can_upload===true;
}

let selectedFiles=[];
let busy=false;

function setMessage(text,kind="muted"){
  const el=document.querySelector("#client-upload-message");
  if(el){el.textContent=text;el.className=`client-upload-message ${kind}`}
}

function drawFiles(){
  const list=document.querySelector("#client-upload-list"),button=document.querySelector("#client-upload-submit"),count=document.querySelector("#client-upload-count");
  if(!list)return;
  if(count)count.textContent=selectedFiles.length?`${selectedFiles.length} file${selectedFiles.length===1?"":"s"} selected`:"No files selected";
  list.innerHTML=selectedFiles.length?selectedFiles.map((f,i)=>`<div class="client-upload-file"><div class="client-file-icon">${esc((f.name.split(".").pop()||"FILE").slice(0,4).toUpperCase())}</div><div class="client-file-main"><strong title="${esc(f.name)}">${esc(f.name)}</strong><span>${fmtSize(f.size)}</span><div class="client-file-status" id="client-file-status-${i}">Ready to upload</div></div><button class="client-file-remove" type="button" data-remove-file="${i}" aria-label="Remove ${esc(f.name)}">×</button></div>`).join(""):"<div class=\"client-empty-files\"><strong>No documents selected</strong><span>Select one or more files above to begin.</span></div>";
  if(button)button.disabled=!selectedFiles.length||busy;
}

async function prepare(file,clientId){
  const token=await session();
  if(!token)throw new Error("Your session has expired. Please sign in again.");
  const body={filename:file.name,byteSize:file.size,contentType:file.type||"application/octet-stream",sha256:await sha256(file),clientId};
  const r=await fetch(`${SUPABASE_URL}/functions/v1/client-prepare-upload`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},body:JSON.stringify(body)});
  const data=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(data.error||"The upload could not be prepared.");
  if(data.state==="duplicate")throw new Error("This file is already stored in KKA. No duplicate upload was made.");
  return data;
}

async function complete(uploadId){
  const token=await session();
  if(!token)throw new Error("Your session has expired. Please sign in again.");
  const r=await fetch(`${SUPABASE_URL}/functions/v1/client-complete-upload`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},body:JSON.stringify({uploadId})});
  const data=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(data.error||"The uploaded file could not be completed.");
  return data;
}

async function uploadOne(file,index,clientId){
  const status=document.querySelector(`#client-file-status-${index}`);
  const set=s=>{if(status)status.textContent=s};
  set("Checking file…");
  const prepared=await prepare(file,clientId);
  const c=prepared.classification||{};
  set(c.area&&c.area!=="other"?`Detected ${c.area.replace("_"," ")}${c.financialYear?` · ${c.financialYear}`:""}${c.period?` · ${c.period}`:""}`:"Ready — KKA review may be required");
  const {error}=await supabase.storage.from("client-documents").uploadToSignedUrl(prepared.objectPath,prepared.token,file,{contentType:file.type||"application/octet-stream"});
  if(error)throw new Error(error.message||"File transfer failed.");
  set("Secured — finalising…");
  const result=await complete(prepared.uploadId);
  set(result.requiresReview?"Uploaded — sent for KKA review":"Uploaded successfully");
  return result;
}

async function uploadAll(){
  if(busy||!selectedFiles.length)return;
  const client=await getSelectedClient();
  if(!client){setMessage("The selected profile could not be loaded.","error");return}
  if(!(await hasUploadAccess())){setMessage("Upload access is no longer enabled for this account.","error");return}
  busy=true;drawFiles();setMessage("Uploading securely… Please keep this page open until complete.","active");
  let ok=0,failed=0;
  for(let i=0;i<selectedFiles.length;i++){
    try{await uploadOne(selectedFiles[i],i,client.id);ok++}catch(e){failed++;const status=document.querySelector(`#client-file-status-${i}`);if(status)status.textContent=e instanceof Error?e.message:"Upload failed"}}
  busy=false;drawFiles();
  if(failed===0){setMessage(`${ok} document${ok===1?"":"s"} uploaded successfully.`,"success");selectedFiles=[];drawFiles()}else setMessage(`${ok} uploaded, ${failed} failed. Failed files remain listed so they can be retried.`,ok?"active":"error");
}

async function render(){
  if(!(await isClient()))return false;
  if(!(await hasUploadAccess()))return false;
  const client=await getSelectedClient();
  const main=document.querySelector(".portal-main");
  if(!main||!client)return false;
  document.querySelectorAll(".sidebar nav a").forEach(a=>a.classList.toggle("active",a.dataset.view==="upload"));
  main.innerHTML=`<style id="client-upload-polish">.client-upload-shell{max-width:980px}.client-upload-head{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;margin-bottom:20px}.client-upload-profile{display:inline-flex;align-items:center;gap:10px;padding:8px 11px;border:1px solid var(--line);border-radius:10px;background:var(--soft);font-size:12px}.client-upload-profile strong{font-size:13px}.client-upload-panel{padding:22px}.client-upload-intro{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;margin-bottom:20px}.client-upload-intro h2{margin:4px 0 5px}.client-upload-intro .pill{flex:0 0 auto}.client-upload-drop{display:flex;align-items:center;justify-content:center;min-height:190px;border:1.5px dashed #9db5a5;border-radius:16px;background:linear-gradient(180deg,var(--soft),var(--white));cursor:pointer;text-align:center;transition:.15s ease}.client-upload-drop:hover{border-color:var(--forest);transform:translateY(-1px)}.client-upload-drop-inner{display:flex;flex-direction:column;align-items:center;gap:7px;padding:25px}.client-upload-drop-icon{width:48px;height:48px;display:grid;place-items:center;border-radius:13px;background:var(--white);border:1px solid var(--line);font-size:22px}.client-upload-drop strong{font-size:16px}.client-upload-drop span{font-size:12px;color:var(--muted)}.client-upload-list-wrap{margin-top:18px}.client-upload-list-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:9px}.client-upload-count{font-size:12px;color:var(--muted)}.client-upload-file{display:flex;align-items:center;gap:12px;padding:12px 13px;border:1px solid var(--line);border-radius:11px;background:var(--white);margin-top:8px}.client-file-icon{width:40px;height:40px;display:grid;place-items:center;border-radius:9px;background:var(--soft);border:1px solid var(--line);font-size:10px;font-weight:800}.client-file-main{min-width:0;flex:1}.client-file-main strong{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:13px}.client-file-main span{display:block;margin-top:2px;font-size:11px;color:var(--muted)}.client-file-status{margin-top:5px;font-size:11px;color:var(--muted)}.client-file-remove{border:0;background:transparent;color:var(--muted);font-size:20px;line-height:1;cursor:pointer;padding:4px 7px}.client-file-remove:hover{color:var(--ink)}.client-empty-files{padding:22px;text-align:center;border:1px dashed var(--line);border-radius:11px;background:var(--soft);color:var(--muted)}.client-empty-files strong,.client-empty-files span{display:block}.client-empty-files strong{color:var(--ink);font-size:13px}.client-empty-files span{margin-top:4px;font-size:11px}.client-upload-actions{display:flex;align-items:center;justify-content:space-between;gap:15px;margin-top:18px;padding-top:17px;border-top:1px solid var(--line)}.client-upload-message{font-size:12px;line-height:1.4}.client-upload-message.error{color:#9a3838}.client-upload-message.success{color:#276847}.client-upload-message.active{color:var(--ink)}.client-upload-submit{min-width:155px}.client-upload-info{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:14px}.client-upload-info div{padding:12px;border:1px solid var(--line);border-radius:10px;background:var(--soft)}.client-upload-info strong{display:block;font-size:12px}.client-upload-info span{display:block;margin-top:3px;font-size:11px;color:var(--muted);line-height:1.4}@media(max-width:700px){.client-upload-head,.client-upload-intro,.client-upload-actions{display:block}.client-upload-intro .pill{display:inline-flex;margin-top:12px}.client-upload-actions .client-upload-submit{width:100%;margin-top:12px}.client-upload-info{grid-template-columns:1fr}.client-upload-panel{padding:15px}}</style>
<div class="client-upload-shell"><div class="client-upload-head"><div><p class="eyebrow">SECURE CLIENT UPLOAD</p><h1>Upload documents</h1><p class="muted">Send documents securely to KKA for the selected profile.</p></div><div class="client-upload-profile"><span>PROFILE</span><strong>${esc(client.display_name||client.legal_name)}</strong></div></div>
<section class="panel client-upload-panel"><div class="client-upload-intro"><div><p class="eyebrow">DOCUMENT INBOX</p><h2>Drop files here or select from device</h2><p class="muted">Files are checked for duplicates and classified from the filename before being accepted.</p></div><span class="pill success">Upload enabled</span></div>
<label class="client-upload-drop" for="client-file-input"><div class="client-upload-drop-inner"><div class="client-upload-drop-icon">↑</div><strong>Select documents</strong><span>PDF, Excel, Word, images and other supported files · maximum 50 MB per file</span><input id="client-file-input" type="file" multiple hidden /></div></label>
<div class="client-upload-list-wrap"><div class="client-upload-list-head"><strong>Selected files</strong><span id="client-upload-count" class="client-upload-count">No files selected</span></div><div id="client-upload-list" class="upload-list"></div></div>
<div class="client-upload-actions"><div id="client-upload-message" class="client-upload-message muted">Nothing is uploaded until the button below is pressed.</div><button class="primary client-upload-submit" id="client-upload-submit" type="button" disabled>Upload securely</button></div>
<div class="client-upload-info"><div><strong>Duplicate protection</strong><span>Identical files are detected before a new upload is issued.</span></div><div><strong>Automatic classification</strong><span>KKA rules use filename identifiers and document type clues.</span></div><div><strong>Review safety</strong><span>Files that cannot be confidently classified can be sent to KKA review.</span></div></div></section></div>`;
  selectedFiles=[];drawFiles();
  const input=document.querySelector("#client-file-input");
  input?.addEventListener("change",()=>{const incoming=[...(input.files||[])].filter(f=>f.size>0&&f.size<=52428800);selectedFiles=[...selectedFiles,...incoming];input.value="";drawFiles();setMessage(incoming.length?"Files are ready. Review the list, then upload securely.":"No valid files were added.",incoming.length?"muted":"error")});
  document.querySelector("#client-upload-list")?.addEventListener("click",e=>{const b=e.target.closest("[data-remove-file]");if(!b||busy)return;selectedFiles.splice(Number(b.dataset.removeFile),1);drawFiles()});
  document.querySelector("#client-upload-submit")?.addEventListener("click",uploadAll);
  return true;
}

async function openForClient(){if(busy)return;busy=true;try{await render()}finally{busy=false}}

document.addEventListener("click",e=>{
  const link=e.target.closest?.('a[data-view="upload"]');
  if(!link||window.KKAClientSession!==true)return;
  e.preventDefault();
  e.stopImmediatePropagation();
  setTimeout(openForClient,0);
},true);

window.KKAClientUploadRender=openForClient;
