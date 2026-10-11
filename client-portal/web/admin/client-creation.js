import { createClient as createSupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "../config.js";

const supabase=createSupabaseClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
const esc=v=>String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
const clean=v=>String(v??"").trim();

const style=document.createElement("style");
style.textContent=`.client-create-email-row{display:grid!important;grid-template-columns:minmax(0,1fr) auto!important}.client-create-email-row input{width:100%!important}.client-create-email-row button{min-width:104px!important}.client-create-mobile-row{display:grid!important;grid-template-columns:150px minmax(0,1fr)!important;gap:8px!important}.client-create-mobile-row select,.client-create-mobile-row input{width:100%!important}.client-create-relation{display:none}.client-create-relation.visible{display:block}.client-create-success-backdrop{z-index:99999!important}.client-create-success-backdrop .modal{max-width:520px!important;text-align:center}.client-create-success-icon{font-size:42px;line-height:1;margin:4px 0 14px}.client-create-success-backdrop .modal-actions{justify-content:center}.client-create-success-backdrop #client-create-success-ok{min-width:120px}.client-create-live{margin:14px 0;padding:16px;border:1px solid rgba(255,255,255,.09);border-radius:14px;background:rgba(0,0,0,.12)}.client-create-live-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.client-create-live-head h3{margin:0;font-size:15px}.client-create-live-head p{margin:0 0 4px}.client-create-live-head span{display:block;font-size:11px;opacity:.65;margin-top:4px;line-height:1.4}.client-create-live-head>strong{font-size:16px}.client-create-live-track{height:7px;border-radius:99px;background:rgba(255,255,255,.08);overflow:hidden;margin:14px 0}.client-create-live-track span{display:block;height:100%;width:10%;transition:width .4s ease;background:currentColor}.client-create-live-steps{display:grid;gap:8px}.client-create-live-steps>div{display:flex;gap:10px;align-items:center;opacity:.42}.client-create-live-steps>div.active,.client-create-live-steps>div.complete{opacity:1}.client-create-live-steps i{font-style:normal;width:23px;height:23px;border:1px solid rgba(255,255,255,.14);border-radius:50%;display:grid;place-items:center;font-size:10px;flex:none}.client-create-live-steps>div.complete i{font-size:0;background:rgba(80,190,130,.13);border-color:rgba(80,190,130,.3)}.client-create-live-steps>div.complete i:after{content:"✓";font-size:11px;color:#72d5a0}.client-create-live-steps strong{display:block;font-size:11px}.client-create-live-steps small{display:block;font-size:10px;opacity:.58;margin-top:1px}.client-create-live-note{border-top:1px solid rgba(255,255,255,.07);margin-top:12px;padding-top:10px;font-size:10px;line-height:1.45;opacity:.55}@media(max-width:620px){.client-create-live-head>strong{font-size:14px}}@media(max-width:520px){.client-create-email-row{grid-template-columns:1fr!important}.client-create-email-row button{width:100%!important}.client-create-mobile-row{grid-template-columns:125px minmax(0,1fr)!important}}`;
document.head.appendChild(style);

async function sessionToken(){const {data:{session}}=await supabase.auth.getSession();if(!session?.access_token)throw new Error("The session has expired. Please sign in again.");return session.access_token}
async function verifyEmail(email){const {data,error}=await supabase.rpc("resolve_client_email_account",{p_email:email});if(error)throw new Error(error.message||"Email could not be checked.");return data||{linked:false,message:"Email could not be checked."}}
async function callFunction(slug,payload){const token=await sessionToken();const r=await fetch(`${SUPABASE_URL}/functions/v1/${slug}`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},body:JSON.stringify(payload)});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||data.message||`Operation failed (HTTP ${r.status}).`);return data}

function closeExistingClientModals(){document.querySelectorAll(".client-login-modal-backdrop,.client-create-success-backdrop").forEach(x=>x.remove())}

function showClientCreationSuccess(m,email){
  const success=document.createElement("div");
  success.className="modal-backdrop client-create-success-backdrop";
  success.innerHTML=`<section class="modal" role="alertdialog" aria-modal="true" aria-labelledby="client-create-success-title"><div class="client-create-success-icon" aria-hidden="true">✓</div><h2 id="client-create-success-title">Client created successfully</h2><p class="muted">The client login has been created and the welcome email has been sent successfully to <strong>${esc(email)}</strong>.</p><div class="modal-actions"><button class="primary" id="client-create-success-ok" type="button">OK</button></div></section>`;
  document.body.appendChild(success);
  const ok=success.querySelector("#client-create-success-ok");
  const acknowledge=()=>{success.remove();m.remove();document.getElementById("refresh-clients")?.click()};
  ok.addEventListener("click",acknowledge);
  ok.focus();
  success.addEventListener("click",e=>e.stopPropagation());
  success.addEventListener("keydown",e=>{if(e.key==="Escape")e.preventDefault()});
}

function showAdminClientCreation(){
  closeExistingClientModals();
  const m=document.createElement("div");
  m.className="modal-backdrop client-login-modal-backdrop";
  m.innerHTML=`<section class="modal" role="dialog" aria-modal="true"><div class="modal-head"><div><p class="eyebrow">NEW CLIENT</p><h2>Create client profile</h2><p class="muted">Check the email first. Existing KKA primary emails will not create another login.</p></div><button class="modal-close" type="button">×</button></div><form id="admin-client-create-form"><div class="form-grid"><label class="full">Primary/login email<div class="client-create-email-row"><input name="email" type="email" required autocomplete="email" placeholder="client@example.com"><button type="button" class="secondary" id="admin-client-email-check">✓ Check</button></div></label><div class="form-message full" id="admin-client-email-status">Email must be checked before the profile can be created.</div><div class="full" id="admin-client-primary-status" hidden></div><label>Legal name<input name="legalName" required maxlength="200"></label><label>Display name<input name="displayName" maxlength="200"></label><label>Full name<input name="fullName" maxlength="200"></label><label class="full">Mobile<div class="client-create-mobile-row"><select name="mobileCountryCode" aria-label="Mobile country code"><option value="+91" selected>🇮🇳 +91 India</option><option value="+1">🇺🇸 +1 United States</option><option value="+44">🇬🇧 +44 United Kingdom</option><option value="+61">🇦🇺 +61 Australia</option><option value="+971">🇦🇪 +971 UAE</option><option value="+65">🇸🇬 +65 Singapore</option><option value="+60">🇲🇾 +60 Malaysia</option><option value="+92">🇵🇰 +92 Pakistan</option><option value="+880">🇧🇩 +880 Bangladesh</option><option value="+94">🇱🇰 +94 Sri Lanka</option><option value="+977">🇳🇵 +977 Nepal</option><option value="+81">🇯🇵 +81 Japan</option><option value="+49">🇩🇪 +49 Germany</option><option value="+33">🇫🇷 +33 France</option><option value="+39">🇮🇹 +39 Italy</option><option value="+86">🇨🇳 +86 China</option><option value="+966">🇸🇦 +966 Saudi Arabia</option><option value="+974">🇶🇦 +974 Qatar</option><option value="+968">🇴🇲 +968 Oman</option><option value="+965">🇰🇼 +965 Kuwait</option><option value="+27">🇿🇦 +27 South Africa</option><option value="+7">🇷🇺 +7 Russia/Kazakhstan</option></select><input name="mobileNumber" type="text" inputmode="numeric" autocomplete="tel-national" maxlength="15" placeholder="98765 43210"></div></label><label>PAN<input name="pan" maxlength="10"></label><label>TAN<input name="tan" maxlength="10"></label><label>CIN<input name="cin" maxlength="21"></label><label>GSTIN<input name="gstin" maxlength="15"></label><label class="full client-create-relation" id="admin-client-relation-wrap">Relationship to primary account<select name="relationship"><option value="">Select relationship</option><option>Spouse</option><option>Son</option><option>Daughter</option><option>Father</option><option>Mother</option><option>Brother</option><option>Sister</option><option>Grandfather</option><option>Grandmother</option><option>Grandson</option><option>Granddaughter</option><option>Other</option></select></label><label class="full">Filename aliases<input name="aliases" placeholder="Name variants, separated by commas"></label><label class="check"><input name="canUpload" type="checkbox"> Allow client uploads</label></div><div class="client-create-live" id="admin-client-live" hidden aria-live="polite"><div class="client-create-live-head"><div><p class="eyebrow">CLIENT CREATION</p><h3 id="client-create-live-title">Preparing secure request…</h3><span id="client-create-live-detail">Please keep this window open while the server processes the request.</span></div><strong id="client-create-live-percent">10%</strong></div><div class="client-create-live-track"><span id="client-create-live-fill"></span></div><div class="client-create-live-steps"><div data-create-step="request"><i>1</i><span><strong>Validate request</strong><small>Verified email and profile details</small></span></div><div data-create-step="account"><i>2</i><span><strong>Account and profile</strong><small>Create the client or family profile</small></span></div><div data-create-step="access"><i>3</i><span><strong>Portal access</strong><small>Set up the appropriate account links</small></span></div><div data-create-step="finish"><i>4</i><span><strong>Confirmation</strong><small>Wait for the server response</small></span></div></div><div class="client-create-live-note" id="client-create-live-note">The percentage shows request progress, not individual database operations. Completion is shown only after the server confirms success.</div></div><div class="form-message" id="admin-client-message"></div><div class="modal-actions"><button type="button" class="secondary modal-close">Cancel</button><button class="primary" id="admin-client-submit" type="submit" disabled>Create profile</button></div></form></section>`;
  document.body.appendChild(m);
  m.querySelectorAll(".modal-close").forEach(b=>b.addEventListener("click",()=>m.remove()));

  const form=m.querySelector("#admin-client-create-form"),email=m.querySelector('[name="email"]'),check=m.querySelector("#admin-client-email-check"),status=m.querySelector("#admin-client-email-status"),primaryStatus=m.querySelector("#admin-client-primary-status"),relationWrap=m.querySelector("#admin-client-relation-wrap"),relation=m.querySelector('[name="relationship"]'),submit=m.querySelector("#admin-client-submit"),message=m.querySelector("#admin-client-message");
  let verifiedEmail="",linkedAccount=null;
  const live=m.querySelector("#admin-client-live"),liveTitle=m.querySelector("#client-create-live-title"),liveDetail=m.querySelector("#client-create-live-detail"),livePercent=m.querySelector("#client-create-live-percent"),liveFill=m.querySelector("#client-create-live-fill"),liveNote=m.querySelector("#client-create-live-note"),liveSteps=[...m.querySelectorAll("[data-create-step]")];
  let progressTimers=[];
  const clearProgressTimers=()=>{progressTimers.forEach(clearTimeout);progressTimers=[]};
  const setCreationProgress=(percent,title,detail,activeIndex,completeAll=false)=>{livePercent.textContent=percent+"%";liveFill.style.width=percent+"%";liveTitle.textContent=title;liveDetail.textContent=detail;liveSteps.forEach((step,i)=>{step.classList.toggle("complete",completeAll);step.classList.toggle("active",!completeAll&&i===activeIndex)})};
  const beginCreationProgress=()=>{clearProgressTimers();live.hidden=false;form.querySelectorAll("input,select,button").forEach(x=>x.disabled=true);m.querySelectorAll(".modal-close").forEach(x=>x.disabled=true);setCreationProgress(10,"Request accepted","Checking the verified request and preparing the server operation.",0);progressTimers.push(setTimeout(()=>setCreationProgress(28,"Creating profile","The server is processing the client profile.",1),800));progressTimers.push(setTimeout(()=>setCreationProgress(52,"Setting up account access","The server is processing account and profile links.",2),2100));progressTimers.push(setTimeout(()=>setCreationProgress(76,"Waiting for confirmation","The request is still running. Completion is not assumed until the server responds.",3),4000))};
  const endCreationProgress=()=>{clearProgressTimers();setCreationProgress(100,"Creation confirmed","The server confirmed that the requested profile operation succeeded.",3,true);liveNote.textContent="Completed successfully. The server response confirmed the profile operation.";};
  const restoreCreationForm=()=>{clearProgressTimers();live.hidden=true;form.querySelectorAll("input,select,button").forEach(x=>x.disabled=false);m.querySelectorAll(".modal-close").forEach(x=>x.disabled=false);submit.disabled=!verifiedEmail||verifiedEmail!==clean(email.value).toLowerCase()};

  email.addEventListener("input",()=>{verifiedEmail="";linkedAccount=null;submit.disabled=true;check.disabled=false;check.textContent="✓ Check";status.textContent="Email must be checked before the profile can be created.";primaryStatus.hidden=true;primaryStatus.innerHTML="";relationWrap.classList.remove("visible");relation.required=false;relation.value="";submit.textContent="Create profile"});

  check.addEventListener("click",async()=>{
    const value=clean(email.value).toLowerCase();
    if(!value||!email.checkValidity()){status.textContent="Enter a valid email address first.";return}
    check.disabled=true;check.textContent="Checking…";status.textContent="Checking email…";primaryStatus.hidden=true;relationWrap.classList.remove("visible");relation.required=false;
    try{
      const data=await verifyEmail(value);verifiedEmail=value;check.textContent="✓ Verified";submit.disabled=false;
      if(data.linked){
        linkedAccount=data;
        primaryStatus.hidden=false;
        primaryStatus.innerHTML=`<div class="message"><strong>✓ Primary account:</strong> ${esc(data.primaryHolder||"Existing KKA account")}${data.accountName?` <span class="muted">· ${esc(data.accountName)}</span>`:""}</div>`;
        status.textContent="This email is already the primary login. No separate login will be created.";
        relationWrap.classList.add("visible");relation.required=true;submit.textContent="Add to family account";
      }else{
        linkedAccount=null;status.textContent=data.message||"Email is available for a new KKA primary account.";submit.textContent="Create client login";
      }
    }catch(e){verifiedEmail="";linkedAccount=null;submit.disabled=true;check.disabled=false;check.textContent="✓ Check";status.textContent=e.message}
    finally{check.disabled=false}
  });

  form.addEventListener("submit",async e=>{
    e.preventDefault();
    if(!verifiedEmail||verifiedEmail!==clean(email.value).toLowerCase()){status.textContent="Please check the email address before creating the profile.";return}
    const d=new FormData(form),pan=clean(d.get("pan")),tan=clean(d.get("tan")),cin=clean(d.get("cin")),gstin=clean(d.get("gstin"));
    if(!pan&&!tan&&!cin&&!gstin){message.textContent="Enter at least one PAN, TAN, CIN or GSTIN.";return}
    if(linkedAccount&&!clean(d.get("relationship"))){message.textContent="Select the relationship to the primary account.";return}
    const mobileNumber=clean(d.get("mobileNumber")),countryCode=clean(d.get("mobileCountryCode"));
    const base={legalName:clean(d.get("legalName")),displayName:clean(d.get("displayName")),fullName:clean(d.get("fullName")),mobile:mobileNumber?countryCode+mobileNumber.replace(/\D/g,""):"",pan,tan,cin,gstin,aliases:clean(d.get("aliases"))};
    if(!base.legalName){message.textContent="Enter the legal name for the family profile.";submit.disabled=false;return}
    submit.disabled=true;message.textContent="";beginCreationProgress();
    try{
      if(linkedAccount){
        const resolvedAccountId=clean(linkedAccount?.accountId||linkedAccount?.account_id);
        const resolvedClientId=clean(linkedAccount?.clientId||linkedAccount?.client_id);
        if(!resolvedAccountId&&!resolvedClientId){throw new Error("The primary family account could not be resolved. Please check the primary email again.");}
        await callFunction("manage-client-family",{action:"create_family_member",accountId:resolvedAccountId,clientId:resolvedClientId,relationship:clean(d.get("relationship")),...base});
        endCreationProgress();message.textContent="Family profile added successfully. No separate login was created.";
      }else{
        const result=await callFunction("create-client-account",{...base,email:verifiedEmail,canUpload:d.get("canUpload")==="on"});
        if(result.emailSent){
          endCreationProgress();
          setTimeout(()=>showClientCreationSuccess(m,verifiedEmail),450);
          return;
        }
        endCreationProgress();
        liveTitle.textContent="Client created; email not sent";
        liveDetail.textContent="The client account was created, but the welcome email failed. Do not submit creation again.";
        liveNote.textContent="The account creation succeeded. Close this window and manage the existing client record; retrying may create a duplicate account.";
        form.querySelectorAll("input,select,button").forEach(x=>x.disabled=true);
        m.querySelectorAll(".modal-close").forEach(x=>x.disabled=false);
        message.textContent="Client login created, but the welcome email could not be sent. Do not retry client creation.";
      }
      if(linkedAccount){
        setTimeout(()=>{m.remove();document.getElementById("refresh-clients")?.click()},700);
      }
    }catch(err){restoreCreationForm();message.textContent=err.message||"Client creation failed. Check the client list before retrying, in case the server completed the operation.";submit.disabled=false}
  });
}


window.KKAShowAdminClientCreation=showAdminClientCreation;
