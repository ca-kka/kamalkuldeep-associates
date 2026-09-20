import { createClient as createSupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

const supabase=createSupabaseClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
const root=document.querySelector("#app");
const template=id=>document.querySelector(id)?.content.cloneNode(true);

function setMessage(text,type=""){
  const m=document.querySelector("#auth-message");
  if(!m)return;
  m.className=`message${type?` ${type}`:""}`;
  m.textContent=text||"";
  if(type==="error")m.setAttribute("role","alert");else m.removeAttribute("role")
}
function showSessionReason(){
  let reason=null;
  try{reason=sessionStorage.getItem("kka-logout-reason");if(reason)sessionStorage.removeItem("kka-logout-reason")}catch{}
  if(!reason)return;
  const message=reason==="inactivity"?"Automatically signed out after 5 minutes of inactivity. Please sign in again to continue.":reason==="manual"?"You have been signed out securely.":"The previous client tab/browser session was closed. Please sign in again to continue.";
  setMessage(message)
}
function setupPasswordToggle(){const input=document.querySelector("#password"),toggle=document.querySelector("#password-toggle");if(!input||!toggle)return;toggle.addEventListener("click",()=>{const visible=input.type==="text";input.type=visible?"password":"text";toggle.textContent=visible?"Show":"Hide";toggle.setAttribute("aria-label",visible?"Show password":"Hide");toggle.setAttribute("aria-pressed",String(!visible));input.focus()})}
function clearLoginError(){document.querySelector("#auth-message")?.classList.remove("error");document.querySelector("#email")?.classList.remove("login-input-error");document.querySelector("#password")?.classList.remove("login-input-error")}
function showLoginError(text="Incorrect email or password. Please try again."){const message=document.querySelector("#auth-message"),email=document.querySelector("#email"),password=document.querySelector("#password");if(message){message.className="message error";message.textContent=text;message.setAttribute("role","alert")}email?.classList.add("login-input-error");password?.classList.add("login-input-error");password?.focus()}
function markClientTabForLogin(){try{sessionStorage.setItem("kka-tab-session:client",String(Date.now()))}catch{}}
function markAdminTabForLogin(){try{sessionStorage.setItem("kka-tab-session:admin",String(Date.now()))}catch{}}
async function redirectForRole(markSession=true){
  const {data:{user}}=await supabase.auth.getUser();
  if(!user){setMessage("Authentication could not be completed. Please try again.","error");return false}
  const {data:profile,error}=await supabase.from("profiles").select("role,active").eq("id",user.id).maybeSingle();
  if(error||!profile){setMessage("Your KKA profile could not be loaded. Please contact KKA.","error");return false}
  if(profile.active!==true){await supabase.auth.signOut();setMessage("This KKA portal account is currently inactive. Please contact KKA.","error");return false}
  if(profile.role==="client"){if(markSession)markClientTabForLogin();window.location.replace("client/");return true}
  if(profile.role==="admin"||profile.role==="staff"){if(markSession)markAdminTabForLogin();window.location.replace("admin/");return true}
  await supabase.auth.signOut();setMessage("This account is not configured for KKA portal access.","error");return false
}
function renderLogin(){
  const t=template("#login-template");if(!t||!root)return;
  root.replaceChildren(t);setupPasswordToggle();showSessionReason();
  const form=document.querySelector("#login-form");if(!form)return;
  form.querySelector("#email")?.addEventListener("input",clearLoginError);
  form.querySelector("#password")?.addEventListener("input",clearLoginError);
  form.addEventListener("submit",async event=>{
    event.preventDefault();
    const email=String(document.querySelector("#email")?.value||"").trim().toLowerCase();
    const password=String(document.querySelector("#password")?.value||"");
    const submit=form.querySelector('button[type="submit"]');
    if(!email||!password)return;
    clearLoginError();if(submit)submit.disabled=true;setMessage("Signing in securely…");
    try{
      const {error}=await supabase.auth.signInWithPassword({email,password});
      if(error){showLoginError("Incorrect email or password. Please try again.");try{window.KKALoginFeedback?.hide?.()}catch{}if(submit)submit.disabled=false;return}
      setMessage("Verification successful. Opening your KKA workspace…","success");
      await redirectForRole();
    }catch(error){showLoginError(error?.message||"The KKA authentication service could not be reached. Please try again.");try{window.KKALoginFeedback?.hide?.()}catch{}if(submit)submit.disabled=false}
  })
}
async function bootstrap(){
  renderLogin();
  const {data:{session}}=await supabase.auth.getSession();
  if(!session?.user)return;
  // Supabase persists authentication, but KKA deliberately binds a login to
  // the current browser session. sessionStorage disappears when the browser
  // session ends, so an authenticated user without our marker must sign in again.
  const {data:profile}=await supabase.from("profiles").select("role,active").eq("id",session.user.id).maybeSingle();
  const marker=profile?.role==="client"
    ?sessionStorage.getItem("kka-tab-session:client")
    :profile?.role==="admin"||profile?.role==="staff"
      ?sessionStorage.getItem("kka-tab-session:admin")
      :null;
  if(profile?.active===true&&profile?.role&&marker){
    await redirectForRole(false);
    return;
  }
  try{sessionStorage.setItem("kka-logout-reason","browser-closed")}catch{}
  await supabase.auth.signOut({scope:"local"});
  renderLogin();
}
supabase.auth.onAuthStateChange((event,session)=>{if(session?.user&&event==="SIGNED_IN")void redirectForRole()});
void bootstrap();
