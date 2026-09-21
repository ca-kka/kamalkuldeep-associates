import { SUPABASE_URL } from "./config.js";

const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/password-reset-otp`;
let overlay = null;
let resendTimer = null;

const esc = v => String(v ?? "").replace(/[&<>'"]/g, c => ({
  "&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"
}[c]));

function stopTimer(){ if(resendTimer) clearInterval(resendTimer); resendTimer=null; }

function closeReset(){
  stopTimer();
  overlay?.remove();
  overlay=null;
}

function startTimer(button,seconds=60){
  stopTimer();
  let left=seconds;
  button.disabled=true;
  const tick=()=>{
    if(!overlay){stopTimer();return}
    if(left<=0){button.disabled=false;button.textContent="Resend code";stopTimer();return}
    button.textContent=`Resend code (${left}s)`;
    left--;
  };
  tick();
  resendTimer=setInterval(tick,1000);
}

function otpInputs(wrap){
  const inputs=[...wrap.querySelectorAll(".kka-reset-otp")];
  inputs.forEach((input,i)=>{
    input.addEventListener("input",()=>{
      input.value=input.value.replace(/\D/g,"").slice(-1);
      if(input.value&&i<inputs.length-1)inputs[i+1].focus();
    });
    input.addEventListener("keydown",e=>{
      if(e.key==="Backspace"&&!input.value&&i>0){inputs[i-1].value="";inputs[i-1].focus()}
      if(e.key==="ArrowLeft"&&i>0){e.preventDefault();inputs[i-1].focus()}
      if(e.key==="ArrowRight"&&i<inputs.length-1){e.preventDefault();inputs[i+1].focus()}
    });
    input.addEventListener("paste",e=>{
      e.preventDefault();
      const value=(e.clipboardData?.getData("text")||"").replace(/\D/g,"").slice(0,6);
      value.split("").forEach((d,n)=>{if(inputs[i+n])inputs[i+n].value=d});
      (inputs.find(x=>!x.value)||inputs[5])?.focus();
    });
  });
  return inputs;
}

function renderEmailStep(){
  if(!overlay)return;
  overlay.innerHTML=`
    <section class="card" role="dialog" aria-modal="true" aria-labelledby="kka-reset-title">
      <div class="brand"><strong>KKA</strong><small>SECURE PORTAL</small></div>
      <p class="eyebrow">PASSWORD RECOVERY</p>
      <h2 id="kka-reset-title">Forgot your password?</h2>
      <p class="muted">Enter the email address registered with your KKA portal account. We will send a verification code to your registered email.</p>
      <form id="kka-reset-email-form">
        <label>Email<input id="kka-reset-email" type="email" autocomplete="email" required></label>
        <p id="kka-reset-message" class="message"></p>
        <button class="primary" id="kka-reset-send" type="submit">Send OTP</button>
      </form>
      <button class="secondary full-width" id="kka-reset-back" type="button">Back to login</button>
    </section>`;
  overlay.querySelector("#kka-reset-email-form").addEventListener("submit",sendOtp);
  overlay.querySelector("#kka-reset-back").addEventListener("click",closeReset);
  overlay.querySelector("#kka-reset-email")?.focus();
}

async function sendOtp(e){
  e.preventDefault();
  const email=String(overlay.querySelector("#kka-reset-email")?.value||"").trim().toLowerCase();
  const message=overlay.querySelector("#kka-reset-message");
  const button=overlay.querySelector("#kka-reset-send");
  if(!email)return;
  button.disabled=true;
  message.textContent="Sending verification code…";
  try{
    const response=await fetch(FUNCTION_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"request",email})});
    const result=await response.json().catch(()=>({}));
    if(!response.ok){message.className="message error";message.textContent=result.error||"Unable to start password recovery. Please try again.";button.disabled=false;return}
    if(!result.challengeId){
      message.className="message success";
      message.textContent=result.message||"If an account exists for this email, a verification code has been sent.";
      button.disabled=false;
      return;
    }
    renderOtpStep(result,email);
  }catch{
    message.className="message error";
    message.textContent="The password recovery service could not be reached. Please try again.";
    button.disabled=false;
  }
}

function renderOtpStep(result,email){
  overlay.innerHTML=`
    <section class="card" role="dialog" aria-modal="true" aria-labelledby="kka-reset-title">
      <div class="brand"><strong>KKA</strong><small>SECURE PORTAL</small></div>
      <p class="eyebrow">PASSWORD RECOVERY</p>
      <h2 id="kka-reset-title">Verify your email</h2>
      <p class="muted">A 6-digit verification code was sent to the registered email address below.</p>
      <div class="destination"><span>Email</span><strong>${esc(result.maskedEmail||"Registered email")}</strong></div>
      <form id="kka-reset-otp-form">
        <div class="otp-cubes">
          <input class="kka-reset-otp" inputmode="numeric" autocomplete="one-time-code" maxlength="1" aria-label="Digit 1" required>
          <input class="kka-reset-otp" inputmode="numeric" maxlength="1" aria-label="Digit 2" required>
          <input class="kka-reset-otp" inputmode="numeric" maxlength="1" aria-label="Digit 3" required>
          <input class="kka-reset-otp" inputmode="numeric" maxlength="1" aria-label="Digit 4" required>
          <input class="kka-reset-otp" inputmode="numeric" maxlength="1" aria-label="Digit 5" required>
          <input class="kka-reset-otp" inputmode="numeric" maxlength="1" aria-label="Digit 6" required>
        </div>
        <p id="kka-reset-message" class="message">The code expires in 10 minutes.</p>
        <button class="primary" id="kka-reset-verify" type="submit">Verify OTP</button>
      </form>
      <div class="actions"><button class="secondary" id="kka-reset-back" type="button">Back</button><button class="secondary" id="kka-reset-resend" type="button">Resend code</button></div>
    </section>`;
  const inputs=otpInputs(overlay);
  const form=overlay.querySelector("#kka-reset-otp-form");
  const message=overlay.querySelector("#kka-reset-message");
  const verify=overlay.querySelector("#kka-reset-verify");
  const resend=overlay.querySelector("#kka-reset-resend");
  startTimer(resend,result.resendAfter??60);
  form.addEventListener("submit",async e=>{
    e.preventDefault();
    const otp=inputs.map(x=>x.value).join("");
    if(!/^\d{6}$/.test(otp)){message.className="message error";message.textContent="Enter all 6 digits.";return}
    verify.disabled=true;message.className="message";message.textContent="Verifying your code…";
    try{
      const response=await fetch(FUNCTION_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"verify",challengeId:result.challengeId,otp})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok){message.className="message error";message.textContent=data.error||"The verification code could not be verified.";verify.disabled=false;inputs.forEach(x=>x.value="");inputs[0]?.focus();return}
      renderPasswordStep(data.resetToken);
    }catch{message.className="message error";message.textContent="The verification service could not be reached. Please try again.";verify.disabled=false}
  });
  overlay.querySelector("#kka-reset-back").addEventListener("click",renderEmailStep);
  resend.addEventListener("click",async()=>{
    if(resend.disabled)return;
    resend.disabled=true;resend.textContent="Sending…";message.textContent="Sending a new verification code…";
    try{
      const response=await fetch(FUNCTION_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"request",email})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data.challengeId){message.className="message error";message.textContent=data.error||"A new code could not be sent.";resend.disabled=false;resend.textContent="Resend code";return}
      renderOtpStep(data,email);
    }catch{message.className="message error";message.textContent="The recovery service could not be reached.";resend.disabled=false;resend.textContent="Resend code"}
  });
  inputs[0]?.focus();
}

function renderPasswordStep(resetToken){
  overlay.innerHTML=`
    <section class="card" role="dialog" aria-modal="true" aria-labelledby="kka-reset-title">
      <div class="brand"><strong>KKA</strong><small>SECURE PORTAL</small></div>
      <p class="eyebrow">PASSWORD RECOVERY</p>
      <h2 id="kka-reset-title">Create new password</h2>
      <p class="muted">Your email has been verified. Set your new permanent KKA portal password now.</p>
      <form id="kka-reset-password-form">
        <label>New password<div class="password-field"><input id="kka-new-password" type="password" minlength="10" maxlength="72" autocomplete="new-password" required><button class="password-toggle" id="kka-new-toggle" type="button">Show</button></div></label>
        <label>Confirm password<input id="kka-confirm-password" type="password" minlength="10" maxlength="72" autocomplete="new-password" required></label>
        <p id="kka-reset-message" class="message">Minimum 10 characters.</p>
        <button class="primary" id="kka-reset-change" type="submit">Change Password</button>
      </form>
    </section>`;
  const password=overlay.querySelector("#kka-new-password");
  const toggle=overlay.querySelector("#kka-new-toggle");
  toggle.addEventListener("click",()=>{const visible=password.type==="text";password.type=visible?"password":"text";toggle.textContent=visible?"Show":"Hide"});
  overlay.querySelector("#kka-reset-password-form").addEventListener("submit",async e=>{
    e.preventDefault();
    const p=password.value;
    const confirm=overlay.querySelector("#kka-confirm-password").value;
    const message=overlay.querySelector("#kka-reset-message");
    const button=overlay.querySelector("#kka-reset-change");
    if(p.length<10){message.className="message error";message.textContent="Password must be at least 10 characters.";return}
    if(p!==confirm){message.className="message error";message.textContent="Passwords do not match.";return}
    button.disabled=true;message.className="message";message.textContent="Changing your password permanently…";
    try{
      const response=await fetch(FUNCTION_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"change-password",resetToken,password:p})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok){message.className="message error";message.textContent=data.error||"The password could not be changed.";button.disabled=false;return}
      message.className="message success";message.textContent="Password changed successfully. Your new password is permanent.";
      setTimeout(()=>{closeReset();window.location.reload()},900);
    }catch{message.className="message error";message.textContent="The password service could not be reached. Please try again.";button.disabled=false}
  });
  password.focus();
}

function openReset(){
  closeReset();
  overlay=document.createElement("div");
  overlay.id="kka-password-reset-overlay";
  overlay.innerHTML=`<style>
#kka-password-reset-overlay{
  position:fixed;inset:0;z-index:100001;display:grid;place-items:center;
  padding:24px;background:rgba(14,27,22,.42);backdrop-filter:blur(14px) saturate(120%);
  -webkit-backdrop-filter:blur(14px) saturate(120%);animation:kkaResetFade .18s ease-out
}
#kka-password-reset-overlay .card{
  width:min(480px,100%);box-sizing:border-box;background:rgba(255,255,255,.94);
  color:var(--ink,#14221d);border:1px solid rgba(203,214,207,.82);border-radius:22px;
  padding:34px;box-shadow:0 30px 90px rgba(20,34,29,.22),0 1px 0 rgba(255,255,255,.85) inset;
  backdrop-filter:blur(20px) saturate(125%);-webkit-backdrop-filter:blur(20px) saturate(125%);
  animation:kkaResetCard .22s cubic-bezier(.2,.8,.2,1)
}
#kka-password-reset-overlay .brand{margin-bottom:25px;color:var(--forest,#1e493d);display:flex;align-items:baseline;gap:9px}
#kka-password-reset-overlay .brand strong{font-size:22px;letter-spacing:.1em;font-weight:800}
#kka-password-reset-overlay .brand small{color:#779082;letter-spacing:.16em;font-size:9px;font-weight:700}
#kka-password-reset-overlay .eyebrow{margin:0 0 7px;color:var(--muted,#68756f);letter-spacing:.14em;font-size:10px;font-weight:800}
#kka-password-reset-overlay h2{margin:0 0 9px;font-size:27px;line-height:1.15;letter-spacing:-.02em;color:var(--ink,#14221d)}
#kka-password-reset-overlay p{line-height:1.55}
#kka-password-reset-overlay .muted{margin:0 0 22px;color:var(--muted,#68756f);font-size:13px}
#kka-password-reset-overlay form{display:grid;gap:14px}
#kka-password-reset-overlay label{display:grid;gap:7px;font-weight:700;font-size:13px}
#kka-password-reset-overlay input{
  width:100%;box-sizing:border-box;padding:12px 13px;border:1px solid var(--line,#dfe5df);
  border-radius:9px;background:rgba(255,255,255,.86);color:var(--ink,#14221d);font:inherit;
  transition:border-color .18s ease,box-shadow .18s ease,background .18s ease
}
#kka-password-reset-overlay input:focus{outline:0;border-color:var(--forest,#1e493d);box-shadow:0 0 0 3px rgba(30,73,61,.11);background:#fff}
#kka-password-reset-overlay .password-field{position:relative}
#kka-password-reset-overlay .password-field input{padding-right:58px}
#kka-password-reset-overlay .password-toggle{
  position:absolute;right:7px;top:50%;transform:translateY(-50%);height:34px;width:42px;
  border:0;border-radius:8px;background:transparent;color:var(--muted,#68756f);font-size:11px;
  font-weight:700;cursor:pointer
}
#kka-password-reset-overlay .password-toggle:hover{background:var(--soft,#eef2ee);color:var(--forest,#1e493d)}
#kka-password-reset-overlay .primary{
  width:100%;margin-top:7px;border:0;border-radius:8px;background:var(--forest,#1e493d);
  color:#fff;font-weight:700;padding:12px 14px;font:inherit;cursor:pointer;
  box-shadow:0 7px 18px rgba(30,73,61,.16);transition:transform .15s ease,box-shadow .15s ease,opacity .15s ease
}
#kka-password-reset-overlay .primary:hover{transform:translateY(-1px);box-shadow:0 10px 24px rgba(30,73,61,.2)}
#kka-password-reset-overlay .primary:active{transform:translateY(0)}
#kka-password-reset-overlay .secondary{
  border:1px solid var(--line,#dfe5df);border-radius:8px;background:rgba(255,255,255,.72);
  color:var(--ink,#14221d);font:inherit;font-size:12px;font-weight:700;padding:10px 13px;
  cursor:pointer;transition:background .15s ease,border-color .15s ease
}
#kka-password-reset-overlay .secondary:hover{background:var(--soft,#eef2ee);border-color:#c5d2ca}
#kka-password-reset-overlay .full-width{width:100%;margin-top:2px}
#kka-password-reset-overlay button:disabled{opacity:.52;cursor:not-allowed;transform:none!important}
#kka-password-reset-overlay .message{min-height:20px;font-size:12px;color:var(--muted,#68756f);margin:0}
#kka-password-reset-overlay .message.error{color:#a33a2d;font-weight:700;background:#fff4f2;border:1px solid #efc7c1;border-radius:8px;padding:9px 11px;box-sizing:border-box}
#kka-password-reset-overlay .message.success{color:#245b3d;font-weight:700}
#kka-password-reset-overlay .destination{
  display:flex;align-items:center;justify-content:space-between;gap:14px;padding:13px 14px;
  margin:0 0 17px;background:var(--soft,#eef2ee);border:1px solid var(--line,#dfe5df);
  border-radius:10px;font-size:12px
}
#kka-password-reset-overlay .destination span{color:var(--muted,#68756f)}
#kka-password-reset-overlay .destination strong{font-size:12px;overflow:hidden;text-overflow:ellipsis}
#kka-password-reset-overlay .otp-cubes{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin:2px 0 4px}
#kka-password-reset-overlay .kka-reset-otp{
  height:54px;text-align:center;font-size:21px;font-weight:800;padding:0;border-radius:10px
}
#kka-password-reset-overlay .actions{display:flex;justify-content:space-between;gap:10px;margin-top:3px}
@keyframes kkaResetFade{from{opacity:0}to{opacity:1}}
@keyframes kkaResetCard{from{opacity:0;transform:translateY(8px) scale(.985)}to{opacity:1;transform:none}}
@media(max-width:520px){
  #kka-password-reset-overlay{padding:14px}
  #kka-password-reset-overlay .card{padding:25px 20px;border-radius:18px}
  #kka-password-reset-overlay h2{font-size:23px}
}
@media(max-width:380px){
  #kka-password-reset-overlay .card{padding:22px 16px}
  #kka-password-reset-overlay .otp-cubes{gap:5px}
  #kka-password-reset-overlay .kka-reset-otp{height:50px;font-size:19px}
}
html[data-theme="dark"] #kka-password-reset-overlay{background:rgba(0,0,0,.58)}
html[data-theme="dark"] #kka-password-reset-overlay .card{
  background:rgba(21,30,26,.94);border-color:rgba(74,95,86,.8);
  color:var(--ink);box-shadow:0 30px 90px rgba(0,0,0,.5),0 1px 0 rgba(255,255,255,.04) inset
}
html[data-theme="dark"] #kka-password-reset-overlay .brand{color:#82c4b1}
html[data-theme="dark"] #kka-password-reset-overlay .brand small,
html[data-theme="dark"] #kka-password-reset-overlay .muted,
html[data-theme="dark"] #kka-password-reset-overlay .message{color:var(--muted)}
html[data-theme="dark"] #kka-password-reset-overlay h2{color:var(--ink)}
html[data-theme="dark"] #kka-password-reset-overlay input{background:#111915;color:var(--ink);border-color:var(--input-border)}
html[data-theme="dark"] #kka-password-reset-overlay input:focus{background:#111915;border-color:var(--accent);box-shadow:0 0 0 3px rgba(99,169,149,.13)}
html[data-theme="dark"] #kka-password-reset-overlay .destination,
html[data-theme="dark"] #kka-password-reset-overlay .secondary{background:var(--soft);border-color:var(--line);color:var(--ink)}
html[data-theme="dark"] #kka-password-reset-overlay .secondary:hover{background:#22302a}
html[data-theme="dark"] #kka-password-reset-overlay .password-toggle{color:var(--muted)}
html[data-theme="dark"] #kka-password-reset-overlay .password-toggle:hover{background:#22302a;color:#8bc9b5}
html[data-theme="dark"] #kka-password-reset-overlay .primary{background:#367763}
html[data-theme="dark"] #kka-password-reset-overlay .primary:hover{background:#438b75}
`;

  document.body.appendChild(overlay);
  renderEmailStep();
}

const linkStyle=document.createElement("style");linkStyle.textContent="#forgot-password-link{display:block;width:100%;margin-top:10px;border:0;background:transparent;color:var(--forest,#1e493d);font:inherit;font-size:13px;font-weight:700;text-decoration:underline;cursor:pointer}#forgot-password-link:hover{opacity:.8}";document.head.appendChild(linkStyle);

function bindForgotPassword(){
  const link=document.querySelector("#forgot-password-link");
  if(link&&link.dataset.kkaBound!=="1"){
    link.dataset.kkaBound="1";
    link.addEventListener("click",openReset);
  }
}

bindForgotPassword();

const observer=new MutationObserver(bindForgotPassword);
observer.observe(document.documentElement,{childList:true,subtree:true});
