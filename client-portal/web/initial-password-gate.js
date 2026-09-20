import { createClient as createSupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

const supabase=createSupabaseClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
const GATE_ID="kka-initial-password-gate";
const esc=v=>String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':'&quot;'}[c]));

function showGate(){
  if(document.getElementById(GATE_ID))return;
  const style=document.createElement("style");
  style.textContent=`#${GATE_ID}{position:fixed;inset:0;z-index:99999;display:grid;place-items:center;background:var(--paper,#f5f3ee);color:var(--ink,#14221d);padding:24px}#${GATE_ID} .kka-password-card{width:min(480px,100%);background:var(--white,#fff);color:var(--ink,#14221d);border:1px solid var(--line,#dfe5df);border-radius:18px;padding:34px;box-shadow:0 24px 70px rgba(20,40,28,.12)}#${GATE_ID} .brand{margin-bottom:28px;color:var(--forest,#1e493d)}#${GATE_ID} .brand strong{color:inherit}#${GATE_ID} .brand small{display:block;color:var(--muted,#68756f);margin-top:6px;letter-spacing:.18em;font-size:9px}#${GATE_ID} h1{margin:6px 0 10px;color:var(--ink,#14221d)}#${GATE_ID} p{line-height:1.55}#${GATE_ID} .muted{color:var(--muted,#68756f)}#${GATE_ID} .eyebrow{color:var(--muted,#68756f);letter-spacing:.13em;font-size:10px;font-weight:800}#${GATE_ID} form{display:grid;gap:14px;margin-top:24px}#${GATE_ID} label{display:grid;gap:7px;font-weight:600;font-size:13px;color:var(--ink,#14221d)}#${GATE_ID} input{width:100%;box-sizing:border-box;padding:12px 13px;border:1px solid var(--input-border,#cbd6cf);border-radius:9px;font:inherit;background:var(--input-bg,var(--white,#fff));color:var(--ink,#14221d)}#${GATE_ID} input:focus{outline:2px solid var(--focus,#b9d2c3);border-color:var(--accent,#1e493d)}#${GATE_ID} button{padding:12px 16px;border:0;border-radius:9px;font-weight:700;cursor:pointer}#${GATE_ID} .primary{background:var(--forest,#1e493d);color:#fff}#${GATE_ID} .secondary{background:var(--soft,#eef2ee);color:var(--forest,#1e493d)}#${GATE_ID} .message{min-height:20px;font-size:13px;color:var(--muted,#66736c)}#${GATE_ID} .message.error{color:var(--danger-text,#f2b0a5)}#${GATE_ID} .message.success{color:var(--success,#245b3d)}`;
  document.head.appendChild(style);
  const wrap=document.createElement("div");wrap.id=GATE_ID;wrap.innerHTML=`<section class="kka-password-card" role="dialog" aria-modal="true"><div class="brand"><strong>KKA</strong><small>CLIENT PLATFORM</small></div><p class="eyebrow">FIRST LOGIN · SECURITY</p><h1>Create your private password</h1><p class="muted">Your temporary password has been accepted. Before entering your workspace, create a password known only to you.</p><form id="kka-password-form"><label>New password<input id="kka-new-password" type="password" minlength="10" maxlength="72" autocomplete="new-password" required></label><label>Confirm password<input id="kka-confirm-password" type="password" minlength="10" maxlength="72" autocomplete="new-password" required></label><p id="kka-password-message" class="message">Use at least 10 characters.</p><button class="primary" type="submit">Create private password</button></form></section>`;
  document.body.appendChild(wrap);
  wrap.querySelector("#kka-password-form").addEventListener("submit",async e=>{
    e.preventDefault();
    const password=wrap.querySelector("#kka-new-password").value;
    const confirm=wrap.querySelector("#kka-confirm-password").value;
    const m=wrap.querySelector("#kka-password-message");
    if(password!==confirm){m.className="message error";m.textContent="Passwords do not match.";return}
    m.className="message";m.textContent="Securing your account…";
    const submit=wrap.querySelector("button[type=submit]");
    if(submit)submit.disabled=true;
    let result={};
    try{
      const {data:{session}}=await supabase.auth.getSession();
      if(!session?.access_token){m.className="message error";m.textContent="Your session expired. Please sign in again.";return}
      const requestId=crypto.randomUUID();
      console.info("[KKA initial-password] request started",{requestId,userId:session.user?.id||null,mustChange:session.user?.app_metadata?.must_change_password===true});
      const r=await fetch(`${SUPABASE_URL}/functions/v1/complete-initial-password`,{method:"POST",headers:{"Content-Type":"application/json","X-KKA-Request-ID":requestId,Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({password})});
      result=await r.json().catch(()=>({}));
      console.info("[KKA initial-password] response",{requestId,status:r.status,ok:r.ok,error:result.error||null});
      if(!r.ok){m.className="message error";m.textContent=(result.error||"Password could not be updated.")+` (Reference: ${requestId.slice(0,8)})`;return}
      const {data:{user:verifiedUser},error:verifyError}=await supabase.auth.getUser();
      const verified=verifyError==null&&verifiedUser?.app_metadata?.must_change_password!==true;
      console.info("[KKA initial-password] post-update verification",{requestId,verified,verifyError:verifyError?.message||null,mustChange:verifiedUser?.app_metadata?.must_change_password??null});
      if(!verified){m.className="message error";m.textContent="The server reported success, but your account was not confirmed as updated. Please try again. Reference: "+requestId.slice(0,8);return}
      await supabase.auth.signOut();
    }catch(error){
      console.error("[KKA initial-password] request failed",error);
      m.className="message error";
      m.textContent="We could not complete the password change. Please try again. Reference: "+(crypto.randomUUID().slice(0,8));
    }finally{
      const currentSubmit=wrap.querySelector("button[type=submit]");
      if(currentSubmit)currentSubmit.disabled=false;
    }
    const emailNote=result.emailSent===true
      ? `<p class="message success">A password-change confirmation has been sent to your registered email address.</p>`
      : `<p class="message">Your password was changed, but the confirmation email could not be sent. Please continue and contact KKA if you do not receive it.</p>`;
    wrap.innerHTML=`<section class="kka-password-card" role="status"><div class="brand"><strong>KKA</strong><small>CLIENT PLATFORM</small></div><p class="eyebrow">SECURITY · COMPLETE</p><h1>Password changed successfully</h1><p class="muted">Your private password has been updated successfully. Please relogin with your new password to continue to your KKA workspace.</p>${emailNote}<button id="kka-relogin" class="primary" type="button">Relogin to continue</button></section>`;
    wrap.querySelector("#kka-relogin").addEventListener("click",()=>location.reload());
  });
}

export async function enforceInitialPassword(){
  const {data:{session}}=await supabase.auth.getSession();
  if(!session?.user)return false;
  if(session.user.app_metadata?.must_change_password===true){showGate();return true}
  return false;
}

window.KKAEnforceInitialPassword=enforceInitialPassword;
void enforceInitialPassword();
supabase.auth.onAuthStateChange((event,session)=>{
  if(event==="SIGNED_IN"&&session?.user?.app_metadata?.must_change_password===true){showGate();}
});