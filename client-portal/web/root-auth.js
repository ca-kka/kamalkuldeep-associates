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
}

function setupPasswordToggle(){
  const input=document.querySelector("#password"),toggle=document.querySelector("#password-toggle");
  if(!input||!toggle)return;
  toggle.addEventListener("click",()=>{
    const visible=input.type==="text";
    input.type=visible?"password":"text";
    toggle.textContent=visible?"Show":"Hide";
    toggle.setAttribute("aria-label",visible?"Show password":"Hide password");
    toggle.setAttribute("aria-pressed",String(!visible));
    input.focus();
  });
}

async function redirectForRole(){
  const {data:{user}}=await supabase.auth.getUser();
  if(!user){setMessage("Authentication could not be completed. Please try again.","error");return false;}
  const {data:profile,error}=await supabase.from("profiles").select("role,active").eq("id",user.id).maybeSingle();
  if(error||!profile){setMessage("Your KKA profile could not be loaded. Please contact KKA.","error");return false;}
  if(profile.active!==true){await supabase.auth.signOut();setMessage("This KKA portal account is currently inactive. Please contact KKA.","error");return false;}
  if(profile.role==="client"){
    window.location.replace("client/");
    return true;
  }
  if(profile.role==="admin"||profile.role==="staff"){
    window.location.replace("admin/");
    return true;
  }
  await supabase.auth.signOut();
  setMessage("This account is not configured for KKA portal access.","error");
  return false;
}

function renderLogin(){
  const t=template("#login-template");
  if(!t||!root)return;
  root.replaceChildren(t);
  setupPasswordToggle();
  const form=document.querySelector("#login-form");
  if(!form)return;
  form.addEventListener("submit",async event=>{
    event.preventDefault();
    const email=String(document.querySelector("#email")?.value||"").trim().toLowerCase();
    const password=String(document.querySelector("#password")?.value||"");
    const submit=form.querySelector('button[type="submit"]');
    if(!email||!password)return;
    if(submit)submit.disabled=true;
    setMessage("Signing in securely…");
    try{
      const {error}=await supabase.auth.signInWithPassword({email,password});
      if(error){
        setMessage("Unable to sign in. Check your credentials or contact KKA.","error");
        try{window.KKALoginFeedback?.hide?.()}catch{}
        if(submit)submit.disabled=false;
        return;
      }
      setMessage("Verification successful. Opening your KKA workspace…","success");
      await redirectForRole();
    }catch(error){
      setMessage(error?.message||"The KKA authentication service could not be reached. Please try again.","error");
      try{window.KKALoginFeedback?.hide?.()}catch{}
      if(submit)submit.disabled=false;
    }
  });
}

async function bootstrap(){
  renderLogin();
  const {data:{session}}=await supabase.auth.getSession();
  if(session?.user)await redirectForRole();
}

supabase.auth.onAuthStateChange((event,session)=>{
  if(session?.user&&event==="SIGNED_IN")void redirectForRole();
});

void bootstrap();
