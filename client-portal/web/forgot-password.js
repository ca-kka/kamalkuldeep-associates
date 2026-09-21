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
#kka-password-reset-overlay{position:fixed;inset:0;z-index:100001;display:grid;place-items:center;padding:20px;background:rgba(8,18,14,.48);backdrop-filter:blur(5px)}
#kka-password-reset-overlay .card{width:min(470px,100%);box-sizing:border-box;background:var(--white,#fff);color:var(--ink,#14221d);border:1px solid var(--line,#dfe5df);border-radius:20px;padding:30px;box-shadow:0 28px 90px rgba(0,0,0,.25)}
#kka-password-reset-overlay .brand{margin-bottom:22px;color:var(--forest,#1e493d)} #kka-password-reset-overlay .brand strong{font-size:24px;letter-spacing:.08em} #kka-password-reset-overlay .brand small{display:block;color:var(--muted,#68756f);margin-top:4px;letter-spacing:.18em;font-size:9px}
#kka-password-reset-overlay h2{margin:6px 0 8px} #kka-password-reset-overlay p{line-height:1.5} #kka-password-reset-overlay .muted{color:var(--muted,#68756f)} #kka-password-reset-overlay .eyebrow{color:var(--muted,#68756f);letter-spacing:.13em;font-size:10px;font-weight:800}
#kka-password-reset-overlay form{display:grid;gap:13px} #kka-password-reset-overlay label{display:grid;gap:7px;font-weight:700} #kka-password-reset-overlay input{width:100%;box-sizing:border-box}
#kka-password-reset-overlay .destination{display:flex;justify-content:space-between;gap:12px;padding:14px;margin:18px 0;background:var(--soft,#eef2ee);border-radius:12px;font-size:13px}
#kka-password-reset-overlay .destination span{color:var(--muted,#68756f)} #kka-password-reset-overlay .otp-cubes{display:grid;grid-template-columns:repeat(6,1fr);gap:8px}
#kka-password-reset-overlay .kka-reset-otp{height:56px;text-align:center;font-size:24px;font-weight:800;padding:0}
#kka-password-reset-overlay .actions{display:flex;justify-content:space-between;gap:10px;margin-top:5px}
#kka-password-reset-overlay .full-width{width:100%;margin-top:10px} #kka-password-reset-overlay button{cursor:pointer} #kka-password-reset-overlay button:disabled{opacity:.55;cursor:not-allowed}
#kka-password-reset-overlay .message{min-height:20px;font-size:13px;color:var(--muted,#68756f);margin:0} #kka-password-reset-overlay .message.error{color:#a33a2d} #kka-password-reset-overlay .message.success{color:#245b3d}
@media(max-width:420px){#kka-password-reset-overlay .card{padding:22px 18px}#kka-password-reset-overlay .otp-cubes{gap:5px}#kka-password-reset-overlay .kka-reset-otp{height:52px;font-size:21px}}
</style>`;
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
