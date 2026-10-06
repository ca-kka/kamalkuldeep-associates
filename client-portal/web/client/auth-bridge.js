import { createClient as createSupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "../config.js";

const supabase=createSupabaseClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
const MARKER="kka-tab-session:client";
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const SESSION_SECURITY_VERSION="20261007-sessionfix2";

const featureModules=[
  "../diagnostic-logger.js?v=20261006-client-id1",
  "../theme.js?v=20261004-issues29b",
  "../operation-feedback.js?v=20261004-issues29b",
  "../session-route-transition.js?v=20261004-issues29b",
  `../session-security.js?v=${SESSION_SECURITY_VERSION}`,
  "../session-settings.js?v=20261004-issues29b",
  "../dashboard-live.js?v=20261004-issues29b",
  "../family-management.js?v=20261004-issues29b",
  "../family-switcher.js?v=20261004-issues29b",
  "../family-profile-context.js?v=20261004-issues29b",
  "../client-upload-view.js?v=20261004-issues29b",
  "../upload-network-resilience.js?v=20261004-issues29b",
  "../family-documents-view.js?v=20261004-portal-doc-host1",
  "../client-dashboard-v2.js?v=20261004-issues29b",
  "../client-profile-menu.js?v=20261004-issues29b",
  "../mobile-menu.js?v=20261004-issues29b",
  "../client-portal-feedback.js?v=20261004-issues29b",
  "../client-shell.js?v=20261004-issues29b"
];

async function stableSession(){
  for(let i=0;i<4;i++){
    const {data:{session}}=await supabase.auth.getSession();
    if(session?.user)return session;
    if(i<3)await sleep(250);
  }
  return null;
}

async function profile(id){
  for(let i=0;i<3;i++){
    const {data,error}=await supabase.from("profiles").select("role,active").eq("id",id).maybeSingle();
    if(!error&&data)return data;
    if(i<2)await sleep(250);
  }
  return null;
}

async function loadFeatureModule(path){
  try{
    await import(path);
    return true;
  }catch(error){
    console.error(`[KKA Client] Optional module failed: ${path}`,error);
    try{window.KKALog?.error?.("client_feature_boot","Optional client module failed",{module:path,message:error?.message||String(error)})}catch{}
    return false;
  }
}

async function root(){
  try{sessionStorage.removeItem(MARKER)}catch{}
  window.location.replace("../");
}

async function boot(){
  try{
    const session=await stableSession();
    if(!session?.user)return root();
    const p=await profile(session.user.id);
    if(!p?.active){await supabase.auth.signOut({scope:"local"}).catch(()=>{});return root()}
    if(p.role!=="client"){
      window.location.replace(p.role==="admin"||p.role==="staff"?"../admin/":"../");
      return;
    }
    if(session.user.app_metadata?.must_change_password===true)return root();
    try{
      sessionStorage.setItem(MARKER,String(Date.now()));
      sessionStorage.setItem("kka-auth-handoff","client");
    }catch{}
    for(const path of featureModules)await loadFeatureModule(path);
    window.dispatchEvent(new CustomEvent("kka:client-ready",{detail:{userId:session.user.id,role:p.role}}));
  }catch(error){
    console.error("[KKA auth bridge] Client critical bootstrap failed",error);
    try{window.KKALog?.error?.("auth_bridge_boot","Client portal critical bootstrap failed",{message:error?.message||String(error)})}catch{}
    await root();
  }
}
void boot();
