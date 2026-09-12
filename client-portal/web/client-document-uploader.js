import { createClient as createSupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

const supabase=createSupabaseClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
const STORAGE_KEY="kka-selected-client";
const ROOT_ID="kka-client-upload-panel";
const esc=v=>String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));

function styles(){
  if(document.getElementById("kka-client-upload-style"))return;
  const s=document.createElement("style");s.id="kka-client-upload-style";s.textContent=`
#${ROOT_ID}{margin-top:16px}.kka-client-upload-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.kka-client-upload-zone{margin-top:14px;padding:18px;border:1px dashed var(--line);border-radius:12px;background:var(--soft)}.kka-client-upload-zone input{display:block;margin-top:10px}.kka-client-upload-actions{display:flex;gap:10px;align-items:center;margin-top:14px}.kka-client-upload-message{font-size:12px;color:var(--muted);line-height:1.5}.kka-client-upload-files{margin-top:12px}.kka-client-upload-item{display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-top:1px solid var(--line);font-size:12px}.kka-client-upload-item small{color:var(--muted)}@media(max-width:600px){.kka-client-upload-head{display:block}.kka-client-upload-actions{flex-wrap:wrap}}
`;document.head.appendChild(s);
}

async function context(){
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return null;
  const {data:profile}=await supabase.from("profiles").select("role,active").eq("id",user.id).maybeSingle();
  if(profile?.role!=="client"||!profile.active)return null;
  const {data:membership}=await supabase.from("client_memberships").select("client_id,can_upload").eq("user_id",user.id).maybeSingle();
  if(!membership?.client_id)return null;
  const clientId=localStorage.getItem(STORAGE_KEY)||membership.client_id;
  const {data:client}=await supabase.from("clients").select("id,display_name,legal_name").eq("id",clientId).eq("active",true).maybeSingle();
  if(!client)return null;
  return {user,membership,client};
}

async function digest(file){return [...new Uint8Array(await crypto.subtle.digest("SHA-256",await file.arrayBuffer()))].map(v=>v.toString(16).padStart(2,"0")).join("")}

async function callFunction(name,body){
  const {data:{session}}=await supabase.auth.getSession();
  if(!session?.access_token)throw new Error("Session expired. Please sign in again.");
  const r=await fetch(`${SUPABASE_URL}/functions/v1/${name}`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`},body:JSON.stringify(body)});
  const data=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(data.error||"Client upload action failed");
  return data;
}

async function render(){
  if(document.getElementById(ROOT_ID))return;
  const ctx=await context();
  if(!ctx||!ctx.membership.can_upload)return;
  const main=document.querySelector(".portal-main");
  if(!main||!document.querySelector('[data-view="documents"].active'))return;
  styles();
  const panel=document.createElement("section");panel.id=ROOT_ID;panel.className="panel";panel.innerHTML=`<div class="kka-client-upload-head"><div><p class="eyebrow">CLIENT UPLOAD</p><h2>Upload documents</h2><p class="muted">Files are uploaded only to the selected profile: <strong>${esc(ctx.client.display_name||ctx.client.legal_name)}</strong>.</p></div><span class="pill success">Upload enabled</span></div><div class="kka-client-upload-zone"><label>Choose files<input id="kka-client-upload-files" type="file" multiple></label><p class="kka-client-upload-message">Maximum 50 MB per file. KKA will classify the document and place it into the selected profile. Low-confidence classification may enter review.</p><div class="kka-client-upload-files" id="kka-client-upload-list"></div><div class="kka-client-upload-actions"><button class="primary" id="kka-client-upload-start" type="button">Upload selected files</button><span class="kka-client-upload-message" id="kka-client-upload-status"></span></div></div>`;
  main.appendChild(panel);
  const input=panel.querySelector("#kka-client-upload-files"),list=panel.querySelector("#kka-client-upload-list"),status=panel.querySelector("#kka-client-upload-status"),button=panel.querySelector("#kka-client-upload-start");
  input.addEventListener("change",()=>{const files=[...input.files];list.innerHTML=files.map(f=>`<div class="kka-client-upload-item"><span>${esc(f.name)}</span><small>${(f.size/1024/1024).toFixed(2)} MB</small></div>`).join("");status.textContent=files.length?`${files.length} file(s) selected.`:""});
  button.addEventListener("click",async()=>{
    const files=[...input.files];if(!files.length){status.textContent="Choose at least one file.";return}
    button.disabled=true;input.disabled=true;let done=0;
    try{for(const file of files){status.textContent=`Preparing ${file.name}…`;const sha256=await digest(file);const prepared=await callFunction("client-prepare-upload",{filename:file.name,sha256,byteSize:file.size,contentType:file.type||"application/octet-stream",clientId:ctx.client.id});if(prepared.state==="duplicate"){done++;continue}status.textContent=`Uploading ${file.name}…`;const {error:uploadError}=await supabase.storage.from("client-documents").uploadToSignedUrl(prepared.objectPath,prepared.token,file,{contentType:file.type||"application/octet-stream"});if(uploadError)throw uploadError;status.textContent=`Finalising ${file.name}…`;await callFunction("client-complete-upload",{uploadId:prepared.uploadId});done++}status.textContent=`${done} file(s) processed successfully.`;input.value="";list.innerHTML="";const refresh=document.querySelector("#family-doc-refresh");refresh?.click()}catch(error){status.textContent=error.message||"Upload failed."}finally{button.disabled=false;input.disabled=false}
  });
}

document.addEventListener("click",e=>{if(!e.target.closest('a[data-view="documents"]'))return;setTimeout(()=>render().catch(()=>{}),80)},true);
window.addEventListener("kka-family-profile-change",()=>{if(document.querySelector('[data-view="documents"].active')){document.getElementById(ROOT_ID)?.remove();setTimeout(()=>render().catch(()=>{}),80)}});
