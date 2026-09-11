import { createClient as createSupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

const supabase=createSupabaseClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
const STORAGE_KEY="kka-selected-client";
const esc=v=>String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));

let bound=false;

async function loadProfiles(){
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return [];
  const {data:profile}=await supabase.from("profiles").select("role").eq("id",user.id).maybeSingle();
  if(profile?.role!=="client")return [];
  const {data,error}=await supabase.from("clients").select("id,legal_name,display_name,active").eq("active",true).order("legal_name",{ascending:true});
  if(error)throw error;
  return data||[];
}

async function renderSwitcher(){
  const header=document.querySelector(".portal-main > header");
  if(!header)return;
  if(document.querySelector("#family-profile-switcher"))return;
  const profiles=await loadProfiles().catch(()=>[]);
  if(!profiles.length)return;

  const saved=localStorage.getItem(STORAGE_KEY);
  const selected=profiles.some(p=>p.id===saved)?saved:profiles[0].id;
  localStorage.setItem(STORAGE_KEY,selected);
  const current=profiles.find(p=>p.id===selected)||profiles[0];

  const wrap=document.createElement("div");
  wrap.id="family-profile-switcher";
  wrap.className="family-switcher";
  wrap.innerHTML=`<label class="family-switcher-label" for="family-profile-select">Profile</label><select id="family-profile-select" aria-label="Switch family profile">${profiles.map(p=>`<option value="${esc(p.id)}" ${p.id===selected?"selected":""}>${esc(p.display_name||p.legal_name)}</option>`).join("")}</select><span class="family-switcher-note">${profiles.length>1?`${profiles.length} profiles in family account`:"Primary profile"}</span>`;
  header.appendChild(wrap);

  const select=wrap.querySelector("#family-profile-select");
  select.addEventListener("change",()=>{
    const next=profiles.find(p=>p.id===select.value);
    if(!next)return;
    localStorage.setItem(STORAGE_KEY,next.id);
    wrap.querySelector(".family-switcher-note").textContent="Profile selected · refreshing workspace next";
  });
}

function scheduleRender(){setTimeout(()=>renderSwitcher(),0)}

document.addEventListener("click",e=>{
  const link=e.target.closest('a[data-view="dashboard"]');
  if(link)scheduleRender();
},true);

document.addEventListener("submit",e=>{
  if(e.target?.id==="login-form")setTimeout(scheduleRender,50);
},true);

supabase.auth.onAuthStateChange((_event,session)=>{if(session?.user)scheduleRender()});

setTimeout(scheduleRender,0);
