import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "../config.js";

const supabase=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
const esc=v=>String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
let familyByClient=new Map();
let membersByClient=new Map();
let familyLoaded=false;

const style=document.createElement("style");
style.textContent=`
.family-profile-btn{margin-left:6px;white-space:nowrap}
.family-profile-modal{max-width:900px;width:min(900px,calc(100vw - 32px))}
.family-profile-table{width:100%;border-collapse:collapse;margin-top:14px}
.family-profile-table th,.family-profile-table td{padding:11px 10px;text-align:left;border-bottom:1px solid rgba(255,255,255,.09)}
.family-profile-table th{font-size:.76rem;letter-spacing:.06em;text-transform:uppercase;opacity:.72}
.family-profile-primary{font-weight:700}
.family-profile-badge{display:inline-flex;margin-left:7px;font-size:.72rem;padding:3px 7px;border-radius:999px;background:rgba(255,255,255,.08)}
.family-upload-btn{white-space:nowrap}
.family-upload-target{margin:12px 0;padding:12px 14px;border-radius:10px;background:rgba(255,255,255,.05);display:flex;align-items:center;justify-content:space-between;gap:12px}
@media(max-width:700px){.family-profile-table{font-size:.9rem}.family-profile-table th:nth-child(2),.family-profile-table td:nth-child(2){display:none}.family-profile-btn{margin-left:0;margin-top:6px}}
`;
document.head.appendChild(style);

async function loadFamilyData(){
  const {data,error}=await supabase.from("client_account_members").select("account_id,client_id,relationship,is_primary,active,clients(id,display_name,legal_name,pan,tan,cin,gstin,mobile,active)").eq("active",true);
  if(error){console.warn("KKA family bridge could not load family profiles",error);return false}
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

function clientName(member){const c=member?.clients||{};return c.display_name||c.legal_name||"Unnamed profile"}
function relation(member){return member?.is_primary?"Primary holder":(member?.relationship||"Family member")}

function decorateClientRows(){
  if(!familyLoaded)return;
  const rows=[...document.querySelectorAll("#client-rows tr")].filter(r=>r.querySelector("[data-manage]"));
  for(const row of rows){
    const manage=row.querySelector("[data-manage]");
    const clientId=manage?.dataset.manage;
    const members=clientId?familyByClient.get(clientId):null;
    if(!members?.length)continue;
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
    return `<tr><td class="${member.is_primary?"family-profile-primary":""}">${esc(name)} ${member.is_primary?`<span class="family-profile-badge">PRIMARY</span>`:`<span class="family-profile-badge">FAMILY</span>`}</td><td>${esc(pan)}</td><td>${esc(relation(member))}</td><td>${esc(status)}</td><td><button type="button" class="primary compact family-upload-btn" data-family-upload="${esc(member.client_id)}">Upload</button></td></tr>`;
  }).join("");
  const m=modal(`<div class="modal-head"><div><p class="eyebrow">FAMILY ACCOUNT</p><h2>Family / Profiles</h2><p class="muted">All profiles use the primary holder's single KKA login. No separate family-member login is created.</p></div><button class="modal-close" type="button">×</button></div><table class="family-profile-table"><thead><tr><th>Profile</th><th>PAN</th><th>Relationship</th><th>Status</th><th>Documents</th></tr></thead><tbody>${rows}</tbody></table><div class="modal-actions"><button type="button" class="secondary modal-close">Close</button></div>`);
  m.querySelectorAll("[data-family-upload]").forEach(button=>button.addEventListener("click",()=>{
    const member=members.find(x=>x.client_id===button.dataset.familyUpload);
    if(!member)return;
    sessionStorage.setItem("kka_family_upload_client_id",member.client_id);
    sessionStorage.setItem("kka_family_upload_client_name",clientName(member));
    sessionStorage.setItem("kka_family_upload_account_id",member.account_id||"");
    m.remove();
    const nav=document.querySelector('.sidebar nav a[data-view="documents"]');
    if(nav)nav.click();else window.location.hash="#documents";
  }));
  return m;
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
  label.querySelector("#clear-family-upload-target")?.addEventListener("click",()=>{sessionStorage.removeItem("kka_family_upload_client_id");sessionStorage.removeItem("kka_family_upload_client_name");sessionStorage.removeItem("kka_family_upload_account_id");label.remove();select.value="";select.dispatchEvent(new Event("change",{bubbles:true}))});
}

const observer=new MutationObserver(()=>{decorateClientRows();bridgeUploader()});
observer.observe(document.body,{childList:true,subtree:true});

(async()=>{await loadFamilyData();bridgeUploader()})();
