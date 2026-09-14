import { createClient as createSupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

const supabase=createSupabaseClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
const GATE_ID="kka-initial-password-gate";
const esc=v=>String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':'&quot;'}[c]));

function showGate(){
  if(document.getElementById(GATE_ID))return;
  const style=document.createElement("style");
  style.textContent=`#${GATE_ID}{position:fixed;inset:0;z-index:99999;display:grid;place-items:center;background:var(--paper,#f5f3ee);padding:24px}.kka-password-card{width:min(480px,100%);background:#fff;border:1px solid #dfe5df;border-radius:18px;padding:34px;box-shadow:0 24px 70px rgba(20,40,28,.12)}.kka-password-card .brand{margin-bottom:28px}.kka-password-card h1{margin:6px 0 10px}.kka-password-card p{line-height:1.55}.kka-password-card form{display:grid;gap:14px;margin-top:24px}.kka-password-card label{display:grid;gap:7px;font-weight:600;font-size:13px}.kka-password-card input{padding:12px 13px;border:1px solid #cbd6cf;border-radius:9px;font:inherit}.kka-password-card button{padding:12px 16px;border:0;border-radius:9px;font-weight:700;cursor:pointer}.kka-password-card .primary{background:#1d4934;color:#fff}.kka-password-card .secondary{background:#eef2ee;color:#1d4934}.kka-password-card .message{min-height:20px;font-size:13px;color:#66736c}.kka-password-card .error{color:#a33b32}.kka-password-card .success{color:#245b3d}`;
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
    const {data:{session}}=await supabase.auth.getSession();
    if(!session?.access_token){m.className="message error";m.textContent="Your session expired. Please sign in again.";return}
    const r=await fetch(`${SUPABASE_URL}/functions/v1/complete-initial-password`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({password})});
    const result=await r.json().catch(()=>({}));
    if(!r.ok){m.className="message error";m.textContent=result.error||"Password could not be updated.";return}

    await supabase.auth.signOut();
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