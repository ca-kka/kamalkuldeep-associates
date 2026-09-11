import { createClient as createSupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_PUBLISHABLE_KEY } from "./config.js";

const supabase=createSupabaseClient("https://wvyjyncgxtstyquecfdg.supabase.co",SUPABASE_PUBLISHABLE_KEY);
const STORAGE_KEY="kka-selected-client";
const esc=v=>String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));

window.KKAFamilyContext={clientId:localStorage.getItem(STORAGE_KEY)||null,profiles:[]};

const style=document.createElement("style");
style.textContent=`#family-profile-switcher{display:flex;align-items:center;gap:10px;margin-top:16px;padding:12px 14px;border:1px solid var(--border,#dfe3e8);border-radius:14px;background:var(--panel,#fff);max-width:520px;flex-wrap:wrap}.family-switcher-label{font-size:.78rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted,#667085)}#family-profile-select{min-width:220px;max-width:100%;padding:9px 34px 9px 11px;border:1px solid var(--border,#dfe3e8);border-radius:10px;background:var(--input,#fff);color:var(--text,#17202a);font:inherit;font-weight:600}.family-switcher-note{font-size:.78rem;color:var(--muted,#667085)}@media(max-width:640px){#family-profile-switcher{max-width:none}.family-switcher-label,#family-profile-select,.family-switcher-note{width:100%}#family-profile-select{min-width:0}}`;
document.head.appendChild(style);

function publishContext(clientId,profiles){
  window.KKAFamilyContext={clientId:clientId||null,profiles:profiles||[]};
  window.dispatchEvent(new CustomEvent("kka-family-profile-change",{detail:{clientId:clientId||null}}));
}

async function loadProfiles(){
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return {profiles:[],directClientId:null};
  const {data:profile}=await supabase.from("profiles").select("role").eq("id",user.id).maybeSingle();
  if(profile?.role!=="client")return {profiles:[],directClientId:null};
  const [{data:profiles,error:profilesError},{data:membership,error:membershipError}]=await Promise.all([
    supabase.from("clients").select("id,legal_name,display_name,active").eq("active",true).order("legal_name",{ascending:true}),
    supabase.from("client_memberships").select("client_id").eq("user_id",user.id).limit(1).maybeSingle()
  ]);
  if(profilesError)throw profilesError;
  if(membershipError)throw membershipError;
  return {profiles:profiles||[],directClientId:membership?.client_id||null};
}

async function renderSwitcher(){
  const header=document.querySelector(".portal-main > header");
  if(!header||document.querySelector("#family-profile-switcher"))return;
  const {profiles,directClientId}=await loadProfiles().catch(()=>({profiles:[],directClientId:null}));
  if(!profiles.length)return;

  const saved=localStorage.getItem(STORAGE_KEY);
  const selected=profiles.some(p=>p.id===saved)?saved:(profiles.some(p=>p.id===directClientId)?directClientId:profiles[0].id);
  localStorage.setItem(STORAGE_KEY,selected);
  publishContext(selected,profiles);

  const wrap=document.createElement("div");
  wrap.id="family-profile-switcher";
  wrap.innerHTML=`<label class="family-switcher-label" for="family-profile-select">Profile</label><select id="family-profile-select" aria-label="Switch family profile">${profiles.map(p=>`<option value="${esc(p.id)}" ${p.id===selected?"selected":""}>${esc(p.display_name||p.legal_name)}</option>`).join("")}</select><span class="family-switcher-note">${profiles.length>1?`${profiles.length} profiles in family account`:"Primary profile"}</span>`;
  header.appendChild(wrap);

  wrap.querySelector("#family-profile-select").addEventListener("change",e=>{
    const next=profiles.find(p=>p.id===e.target.value);
    if(!next)return;
    localStorage.setItem(STORAGE_KEY,next.id);
    publishContext(next.id,profiles);
    wrap.querySelector(".family-switcher-note").textContent="Profile selected · refreshing workspace…";
    window.dispatchEvent(new CustomEvent("kka-family-profile-refresh"));
  });
}

function scheduleRender(){setTimeout(renderSwitcher,0)}

document.addEventListener("click",e=>{
  if(e.target.closest('a[data-view="dashboard"]'))scheduleRender();
},true);
document.addEventListener("submit",e=>{
  if(e.target?.id==="login-form")setTimeout(scheduleRender,50);
},true);
supabase.auth.onAuthStateChange((_event,session)=>{if(session?.user)scheduleRender()});
scheduleRender();
