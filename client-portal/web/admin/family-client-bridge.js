import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "../config.js";

const supabase=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
const esc=v=>String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
let familyByClient=new Map();
let membersByClient=new Map();
let familyLoaded=false;
let familyIsAdmin=false;
let familyLoadPromise=null;

const style=document.createElement("style");
style.textContent=`
.family-profile-btn{margin-left:6px;white-space:nowrap}
.family-profile-modal{max-width:900px;width:min(900px,calc(100vw - 32px))}
.family-profile-table{width:100%;border-collapse:collapse;margin-top:14px}
.family-profile-table th,.family-profile-table td{padding:11px 10px;text-align:left;border-bottom:1px solid rgba(255,255,255,.09)}
.family-profile-table th{font-size:.76rem;letter-spacing:.06em;text-transform:uppercase;opacity:.72}
.family-profile-primary{font-weight:700}
.family-profile-badge{display:inline-flex;margin-left:7px;font-size:.72rem;padding:3px 7px;border-radius:999px;background:rgba(255,255,255,.08)}
.family-upload-btn,.family-manage-btn{white-space:nowrap}
.family-remove-btn{background:#8f3434!important;color:#fff!important;border-color:#8f3434!important}
.family-profile-table th:last-child,.family-profile-table td:last-child{white-space:nowrap}
.family-upload-target{margin:12px 0;padding:12px 14px;border-radius:10px;background:rgba(255,255,255,.05);display:flex;align-items:center;justify-content:space-between;gap:12px}
@media(max-width:700px){.family-profile-table{font-size:.9rem}.family-profile-table th:nth-child(2),.family-profile-table td:nth-child(2){display:none}.family-profile-btn{margin-left:0;margin-top:6px}}
`;
document.head.appendChild(style);

async function loadFamilyData(){
  const {data,error}=await supabase.from("client_account_members")
    .select("account_id,client_id,relationship,is_primary,active,clients(id,display_name,legal_name,pan,tan,cin,gstin,mobile,active)")
    .eq("active",true);
  if(error){
    familyLoaded=false;
    console.warn("KKA family bridge could not load family profiles",error);
    return false;
  }
  const groups=new Map();
  membersByClient=new Map();
  for(const member of data||[]){
    if(!member.client_id||!member.account_id)continue;
    if(!groups.has(member.account_id))groups.set(member.account_id,[]);
    groups.get(member.account_id).push(member);
    membersByClient.set(member.client_id,member);
  }
  familyByClient=new Map();
  for(const members of groups.values()){
    if(members.length<2)continue;
    const ordered=[...members].sort((a,b)=>Number(b.is_primary)-Number(a.is_primary));
    for(const member of ordered)familyByClient.set(member.client_id,ordered);
  }
  familyLoaded=true;
  decorateClientRows();
  return true;
}

async function refreshFamilyData(){
  if(familyLoadPromise)return familyLoadPromise;
  familyLoadPromise=(async()=>{
    const {data:{user}}=await supabase.auth.getUser();
    if(!user){
      familyLoaded=false;
      familyIsAdmin=false;
      familyByClient=new Map();
      membersByClient=new Map();
      return false;
    }
    const {data:profile,error:profileError}=await supabase.from("profiles")
      .select("role,active").eq("id",user.id).maybeSingle();
    if(profileError||!profile?.active||!["admin","staff"].includes(profile.role)){
      familyLoaded=false;
      familyIsAdmin=false;
      familyByClient=new Map();
      membersByClient=new Map();
      return false;
    }
    familyIsAdmin=profile.role==="admin";
    return loadFamilyData();
  })().finally(()=>{familyLoadPromise=null});
  return familyLoadPromise;
}

function clientName(member){const c=member?.clients||{};return c.display_name||c.legal_name||"Unnamed profile"}
function relation(member){return member?.is_primary?"Primary holder":(member?.relationship||"Family member")}

function hideFamilyChildRows(){
  if(!familyLoaded)return;
  [...document.querySelectorAll("#client-rows tr")].forEach(row=>{
    const manage=row.querySelector("[data-manage]");
    const clientId=manage?.dataset.manage;
    if(!clientId)return;
    const member=membersByClient.get(clientId);
    if(member&&!member.is_primary)row.remove();
  });
}

function decorateClientRows(){
  if(!familyLoaded)return;
  hideFamilyChildRows();
  const rows=[...document.querySelectorAll("#client-rows tr")].filter(r=>r.querySelector("[data-manage]"));
  for(const row of rows){
    const manage=row.querySelector("[data-manage]");
    const clientId=manage?.dataset.manage;
    const member=clientId?membersByClient.get(clientId):null;
    const members=clientId?familyByClient.get(clientId):null;
    if(!member?.is_primary||!members?.length)continue;
    const cell=manage.closest("td");
    if(!cell||cell.querySelector(".family-profile-btn"))continue;
    const button=document.createElement("button");
    button.type="button";
    button.className="secondary compact family-profile-btn";
    button.textContent="Family / Profiles";
    button.title="Manage profiles linked to this primary account";
    button.addEventListener("click",()=>showFamilyProfiles(members));
    cell.appendChild(button);
  }
}

function modal(inner){
  const m=document.createElement("div");
  m.className="modal-backdrop client-login-modal-backdrop";
  m.innerHTML=`<section class="modal family-profile-modal" role="dialog" aria-modal="true">${inner}</section>`;
  document.body.appendChild(m);
  m.querySelectorAll(".modal-close").forEach(b=>b.addEventListener("click",()=>m.remove()));
  return m;
}

function showFamilyProfiles(members){
  const ordered=[...members].sort((a,b)=>Number(b.is_primary)-Number(a.is_primary));
  const rows=ordered.map(member=>{
    const c=member.clients||{};
    const name=clientName(member);
    const pan=c.pan||"—";
    const status=c.active===false?"Inactive":"Active";
    return `<tr><td class="${member.is_primary?"family-profile-primary":""}">${esc(name)} ${member.is_primary?`<span class="family-profile-badge">PRIMARY</span>`:`<span class="family-profile-badge">FAMILY</span>`}</td><td>${esc(pan)}</td><td>${esc(relation(member))}</td><td>${esc(status)}</td><td><button type="button" class="primary compact family-upload-btn" data-family-upload="${esc(member.client_id)}">Upload</button></td><td>${!member.is_primary&&familyIsAdmin?`<button type="button" class="secondary compact family-manage-btn" data-family-manage="${esc(member.client_id)}">Manage</button>`:"—"}</td></tr>`;
  }).join("");
  const m=modal(`<div class="modal-head"><div><p class="eyebrow">FAMILY ACCOUNT</p><h2>Family / Profiles</h2><p class="muted">All profiles use the primary holder's single KKA login. No separate family-member login is created.</p></div><button class="modal-close" type="button">×</button></div><table class="family-profile-table"><thead><tr><th>Profile</th><th>PAN</th><th>Relationship</th><th>Status</th><th>Documents</th><th>Manage</th></tr></thead><tbody>${rows}</tbody></table><div class="modal-actions"><button type="button" class="secondary modal-close">Close</button></div>`);
  m.querySelectorAll("[data-family-manage]").forEach(button=>button.addEventListener("click",e=>{
    e.preventDefault();e.stopPropagation();
    const member=members.find(x=>x.client_id===button.dataset.familyManage);
    if(member)showFamilyMemberManagement(member,members,m);
  }));
  m.querySelectorAll("[data-family-upload]").forEach(button=>button.addEventListener("click",e=>{
    e.preventDefault();e.stopPropagation();
    const member=members.find(x=>x.client_id===button.dataset.familyUpload);
    if(!member)return;
    sessionStorage.setItem("kka_family_upload_client_id",member.client_id);
    sessionStorage.setItem("kka_family_upload_client_name",clientName(member));
    sessionStorage.setItem("kka_family_upload_account_id",member.account_id||"");
    m.remove();
    const openDocuments=window.KKADocumentUploaderRender;
    if(typeof openDocuments!=="function"){
      let attempts=0;
      const waitForUploader=()=>{
        const uploader=window.KKADocumentUploaderRender;
        if(typeof uploader==="function"){
          try{uploader();waitForUploaderDom()}catch(error){console.error("KKA family upload navigation failed",error);fallbackToDocuments()}
          return;
        }
        if(++attempts>=20){fallbackToDocuments();return}
        setTimeout(waitForUploader,100);
      };
      waitForUploader();
    }else{
      try{openDocuments();waitForUploaderDom()}catch(error){console.error("KKA family upload navigation failed",error);fallbackToDocuments()}
    }
    function waitForUploaderDom(){
      let attempts=0;
      const wait=()=>{
        if(document.querySelector("#manual-client")){bridgeUploader();return}
        if(++attempts>=30){console.warn("KKA family upload target could not find the manual client selector");return}
        setTimeout(wait,100);
      };
      wait();
    }
    function fallbackToDocuments(){
      const nav=document.querySelector('.sidebar nav a[data-view="documents"]');
      if(nav)nav.click();else window.location.hash="#documents";
    }
  }));
}


function showFamilyMemberManagement(member,currentMembers,parentModal){
  if(!familyIsAdmin||member?.is_primary)return;
  const name=clientName(member);
  const relationText=relation(member);
  const m=modal(`<div class="modal-head"><div><p class="eyebrow">FAMILY MEMBER</p><h2>Manage profile</h2><p class="muted">Manage only this family-member link. The primary holder and other profiles will not be deleted.</p></div><button class="modal-close" type="button">×</button></div><div class="message"><strong>${esc(name)}</strong><div class="muted">${esc(relationText)} · PAN ${esc(member.clients?.pan||"—")}</div></div><div class="form-message" data-family-manage-message role="status"></div><div class="modal-actions"><button type="button" class="secondary modal-close">Cancel</button><button type="button" class="secondary" data-family-action="deactivate">Deactivate</button><button type="button" class="family-remove-btn" data-family-action="remove">Remove from family</button></div>`);
  const message=m.querySelector("[data-family-manage-message]");
  const buttons=[...m.querySelectorAll("[data-family-action]")];
  buttons.forEach(button=>button.addEventListener("click",async()=>{
    const action=button.dataset.familyAction;
    const actionLabel=action==="remove"?"remove this profile from the family account":"deactivate this family profile";
    if(!window.confirm(`Are you sure you want to ${actionLabel}? The underlying client record and documents will not be permanently deleted.`))return;
    buttons.forEach(b=>b.disabled=true);
    message.textContent=action==="remove"?"Removing family link…":"Deactivating family profile…";
    try{
      const {data,error}=await supabase.functions.invoke("manage-client-family",{
        body:{action:action==="remove"?"remove":"deactivate_member",accountId:member.account_id,clientId:member.client_id}
      });
      if(error)throw error;
      if(data?.error)throw new Error(data.error);
      if(!data?.success)throw new Error("The family profile operation did not confirm success.");
      m.remove();
      parentModal.remove();
      try{
        const refreshed=await refreshFamilyData();
        if(!refreshed)return;
        const primary=currentMembers.find(x=>x.is_primary);
        const remaining=primary?familyByClient.get(primary.client_id):null;
        if(remaining?.length>1)showFamilyProfiles(remaining);
      }catch(refreshError){
        console.warn("KKA family profile changed, but the list could not be refreshed automatically",refreshError);
      }
    }catch(error){
      message.textContent=error?.message||"Family profile operation failed. Please try again.";
      buttons.forEach(b=>b.disabled=false);
    }
  }));
}

function bridgeUploader(){
  const select=document.querySelector("#manual-client");
  if(!select||!familyLoaded)return;
  const id=sessionStorage.getItem("kka_family_upload_client_id");
  const name=sessionStorage.getItem("kka_family_upload_client_name");
  if(!id)return;
  const member=membersByClient.get(id);
  if(!member)return;
  if(![...select.options].some(o=>o.value===id)){
    const option=document.createElement("option");
    option.value=id;
    option.textContent=`${clientName(member)} · Family profile`;
    select.appendChild(option);
  }
  select.value=id;
  select.dispatchEvent(new Event("change",{bubbles:true}));
  if(document.querySelector(".family-upload-target"))return;
  const label=document.createElement("div");
  label.className="family-upload-target";
  label.innerHTML=`<div><strong>Uploading for: ${esc(name||clientName(member))}</strong><div class="muted">Family profile · ${esc(relation(member))}</div></div><button type="button" class="secondary compact" id="clear-family-upload-target">Change</button>`;
  const panel=document.querySelector(".uploader-panel");
  if(panel)panel.prepend(label);
  label.querySelector("#clear-family-upload-target")?.addEventListener("click",()=>{
    sessionStorage.removeItem("kka_family_upload_client_id");
    sessionStorage.removeItem("kka_family_upload_client_name");
    sessionStorage.removeItem("kka_family_upload_account_id");
    label.remove();
    select.value="";
    select.dispatchEvent(new Event("change",{bubbles:true}));
  });
}

const observer=new MutationObserver(()=>{decorateClientRows();bridgeUploader()});
observer.observe(document.body,{childList:true,subtree:true});

document.addEventListener("click",event=>{
  const refresh=event.target.closest?.("#refresh-clients");
  if(refresh)setTimeout(()=>refreshFamilyData(),0);
});

supabase.auth.onAuthStateChange((event,session)=>{
  setTimeout(()=>{
    if(session)refreshFamilyData();
    else{familyLoaded=false;familyIsAdmin=false;familyByClient=new Map();membersByClient=new Map()}
  },0);
});

setTimeout(()=>refreshFamilyData(),0);
