import { createClient as createSupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "../config.js";

const supabase = createSupabaseClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const esc = v => String(v ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
let familyByClient = new Map();
let familyLoaded = false;

const style = document.createElement("style");
style.textContent = `
.family-details-btn{margin-left:6px;white-space:nowrap}
.family-details-modal{max-width:760px;width:min(760px,calc(100vw - 32px))}
.family-details-table{width:100%;border-collapse:collapse;margin-top:14px}
.family-details-table th,.family-details-table td{padding:11px 10px;text-align:left;border-bottom:1px solid rgba(255,255,255,.09)}
.family-details-table th{font-size:.76rem;letter-spacing:.06em;text-transform:uppercase;opacity:.72}
.family-primary{font-weight:700}
.family-empty{padding:16px;border-radius:10px;background:rgba(255,255,255,.04)}
@media(max-width:700px){.family-details-table{font-size:.9rem}.family-details-table th:nth-child(2),.family-details-table td:nth-child(2){display:none}.family-details-btn{margin-left:0;margin-top:6px}}
`;
document.head.appendChild(style);

function modal(inner){
  const m=document.createElement("div");
  m.className="modal-backdrop client-login-modal-backdrop";
  m.innerHTML=`<section class="modal family-details-modal" role="dialog" aria-modal="true">${inner}</section>`;
  document.body.appendChild(m);
  m.querySelectorAll(".modal-close").forEach(b=>b.addEventListener("click",()=>m.remove()));
  return m;
}

async function loadFamilyData(){
  const {data,error}=await supabase
    .from("client_account_members")
    .select("account_id,client_id,relationship,is_primary,active,clients(display_name,legal_name,pan,gstin)")
    .eq("active",true);
  if(error){console.warn("KKA family details could not be loaded",error);return;}
  const groups=new Map();
  for(const member of data||[]){
    if(!groups.has(member.account_id))groups.set(member.account_id,[]);
    groups.get(member.account_id).push(member);
  }
  familyByClient=new Map();
  for(const members of groups.values()){
    if(members.length<2)continue;
    for(const member of members)familyByClient.set(member.client_id,members);
  }
  familyLoaded=true;
  decorateRows();
}

function rowClientKey(row){
  const cells=[...row.children].map(x=>x.textContent.trim());
  const pan=(cells[1]||"").toUpperCase();
  const gstin=(cells[2]||"").toUpperCase();
  return {pan,gstin};
}

async function resolveClientId(row){
  const {pan,gstin}=rowClientKey(row);
  if(pan && pan!=="—"){
    const {data}=await supabase.from("clients").select("id").eq("pan",pan).maybeSingle();
    if(data?.id)return data.id;
  }
  if(gstin && gstin!=="—"){
    const {data}=await supabase.from("clients").select("id").eq("gstin",gstin).maybeSingle();
    if(data?.id)return data.id;
  }
  return null;
}

async function decorateRows(){
  if(!familyLoaded)return;
  const rows=[...document.querySelectorAll("#client-rows tr")].filter(r=>r.children.length>=5);
  for(const row of rows){
    if(row.querySelector(".family-details-btn"))continue;
    const clientId=await resolveClientId(row);
    if(!clientId)continue;
    const members=familyByClient.get(clientId);
    if(!members?.length)continue;
    const manageCell=row.lastElementChild;
    if(!manageCell)continue;
    const button=document.createElement("button");
    button.type="button";
    button.className="secondary compact family-details-btn";
    button.textContent="Family";
    button.title="View family profiles";
    button.addEventListener("click",()=>showFamilyDetails(members));
    manageCell.appendChild(button);
  }
}

function showFamilyDetails(members){
  const ordered=[...members].sort((a,b)=>Number(b.is_primary)-Number(a.is_primary));
  const rows=ordered.map(member=>{
    const client=member.clients||{};
    const name=client.display_name||client.legal_name||"Unnamed client";
    const pan=client.pan||"—";
    const relation=member.is_primary?"Primary account":(member.relationship||"Family member");
    return `<tr><td class="${member.is_primary?"family-primary":""}">${esc(name)}</td><td>${esc(pan)}</td><td>${esc(relation)}</td></tr>`;
  }).join("");
  const m=modal(`<div class="modal-head"><div><p class="eyebrow">FAMILY ACCOUNT</p><h2>Family Details</h2><p class="muted">Profiles linked to the same primary KKA login.</p></div><button class="modal-close" type="button">×</button></div><table class="family-details-table"><thead><tr><th>Name</th><th>PAN</th><th>Relation</th></tr></thead><tbody>${rows}</tbody></table><div class="modal-actions"><button type="button" class="secondary modal-close">Close</button></div>`);
  return m;
}

const observer=new MutationObserver(()=>{ if(document.getElementById("client-rows")) decorateRows(); });
observer.observe(document.body,{childList:true,subtree:true});
loadFamilyData();
