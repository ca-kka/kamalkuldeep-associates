import { createClient as createSupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

const supabase=createSupabaseClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
const esc=v=>String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));

async function isClient(){
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return false;
  const {data:p}=await supabase.from("profiles").select("role,active").eq("id",user.id).maybeSingle();
  return p?.active===true&&p.role==="client";
}

async function getSelectedClient(){
  const id=localStorage.getItem("kka-selected-client");
  if(!id)return null;
  const {data,error}=await supabase.from("clients").select("id,display_name,legal_name").eq("id",id).maybeSingle();
  if(error||!data)return null;
  return data;
}

async function hasUploadAccess(){
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return false;
  const {data:m}=await supabase.from("client_memberships").select("can_upload").eq("user_id",user.id).maybeSingle();
  return m?.can_upload===true;
}

async function render(){
  if(!(await isClient()))return false;
  if(!(await hasUploadAccess()))return false;
  const client=await getSelectedClient();
  const main=document.querySelector(".portal-main");
  if(!main||!client)return false;
  document.querySelectorAll(".sidebar nav a").forEach(a=>a.classList.toggle("active",a.dataset.view==="upload"));
  main.innerHTML=`<header><div><p class="eyebrow">SECURE CLIENT UPLOAD</p><h1>Upload documents</h1><p class="muted">Upload files for the selected family profile: <strong>${esc(client.display_name||client.legal_name)}</strong>.</p></div></header>
<section class="panel client-upload-panel"><div class="panel-head"><div><p class="eyebrow">UPLOAD ACCESS</p><h2>Upload is enabled</h2><p class="muted">KKA has enabled document upload for this client account. The upload screen is separate from the staff desktop uploader.</p></div><span class="pill success">Upload enabled</span></div>
<label class="drop-zone client-upload-drop" for="client-file-input"><strong>Select documents</strong><span>Choose one or more files from this device.</span><input id="client-file-input" type="file" multiple hidden /></label>
<div id="client-upload-list" class="upload-list"><p class="muted">No files selected.</p></div>
<div class="client-upload-note"><strong>Testing stage:</strong> the permission-controlled upload tab is live, but the secure client upload API is not connected yet. No file will be uploaded from this screen.</div></section>`;
  const input=document.querySelector("#client-file-input"),list=document.querySelector("#client-upload-list");
  input?.addEventListener("change",()=>{
    const files=[...(input.files||[])];
    list.innerHTML=files.length?files.map(f=>`<div class="upload-row"><strong>${esc(f.name)}</strong><span>${Math.ceil(f.size/1024)} KB</span></div>`).join(""):`<p class="muted">No files selected.</p>`;
  });
  return true;
}

let busy=false;
async function openForClient(){if(busy)return;busy=true;try{await render()}finally{busy=false}}

document.addEventListener("click",e=>{
  const link=e.target.closest?.('a[data-view="upload"]');
  if(!link||window.KKAClientSession!==true)return;
  e.preventDefault();
  e.stopImmediatePropagation();
  setTimeout(openForClient,0);
},true);

window.KKAClientUploadRender=openForClient;
