import { createClient as createSupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "../config.js";

const supabase=createSupabaseClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
const esc=v=>String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
const clean=v=>String(v??"").trim();

const style=document.createElement("style");
style.textContent=`.client-create-email-row{display:grid!important;grid-template-columns:minmax(0,1fr) auto!important}.client-create-email-row input{width:100%!important}.client-create-email-row button{min-width:104px!important}.client-create-mobile-row{display:grid!important;grid-template-columns:150px minmax(0,1fr)!important;gap:8px!important}.client-create-mobile-row select,.client-create-mobile-row input{width:100%!important}.client-create-relation{display:none}.client-create-relation.visible{display:block}@media(max-width:520px){.client-create-email-row{grid-template-columns:1fr!important}.client-create-email-row button{width:100%!important}.client-create-mobile-row{grid-template-columns:125px minmax(0,1fr)!important}}`;
document.head.appendChild(style);

async function sessionToken(){const {data:{session}}=await supabase.auth.getSession();if(!session?.access_token)throw new Error("The session has expired. Please sign in again.");return session.access_token}
async function verifyEmail(email){const {data,error}=await supabase.rpc("resolve_client_email_account",{p_email:email});if(error)throw new Error(error.message||"Email could not be checked.");return data||{linked:false,message:"Email could not be checked."}}
async function callFunction(slug,payload){const token=await sessionToken();const r=await fetch(`${SUPABASE_URL}/functions/v1/${slug}`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},body:JSON.stringify(payload)});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||data.message||`Operation failed (HTTP ${r.status}).`);return data}

function closeExistingClientModals(){document.querySelectorAll(".client-login-modal-backdrop").forEach(x=>x.remove())}

function showAdminClientCreation(){
  closeExistingClientModals();
  const m=document.createElement("div");
  m.className="modal-backdrop client-login-modal-backdrop";
  m.innerHTML=`<section class="modal" role="dialog" aria-modal="true"><div class="modal-head"><div><p class="eyebrow">NEW CLIENT</p><h2>Create client profile</h2><p class="muted">Check the email first. Existing KKA primary emails will not create another login.</p></div><button class="modal-close" type="button">×</button></div><form id="admin-client-create-form"><div class="form-grid"><label class="full">Primary/login email<div class="client-create-email-row"><input name="email" type="email" required autocomplete="email" placeholder="client@example.com"><button type="button" class="secondary" id="admin-client-email-check">✓ Check</button></div></label><div class="form-message full" id="admin-client-email-status">Email must be checked before the profile can be created.</div><div class="full" id="admin-client-primary-status" hidden></div><label>Legal name<input name="legalName" required maxlength="200"></label><label>Display name<input name="displayName" maxlength="200"></label><label>Full name<input name="fullName" maxlength="200"></label><label class="full">Mobile<div class="client-create-mobile-row"><select name="mobileCountryCode" aria-label="Mobile country code"><option value="+91" selected>🇮🇳 +91 India</option><option value="+1">🇺🇸 +1 United States</option><option value="+44">🇬🇧 +44 United Kingdom</option><option value="+61">🇦🇺 +61 Australia</option><option value="+971">🇦🇪 +971 UAE</option><option value="+65">🇸🇬 +65 Singapore</option><option value="+60">🇲🇾 +60 Malaysia</option><option value="+92">🇵🇰 +92 Pakistan</option><option value="+880">🇧🇩 +880 Bangladesh</option><option value="+94">🇱🇰 +94 Sri Lanka</option><option value="+977">🇳🇵 +977 Nepal</option><option value="+81">🇯🇵 +81 Japan</option><option value="+49">🇩🇪 +49 Germany</option><option value="+33">🇫🇷 +33 France</option><option value="+39">🇮🇹 +39 Italy</option><option value="+86">🇨🇳 +86 China</option><option value="+966">🇸🇦 +966 Saudi Arabia</option><option value="+974">🇶🇦 +974 Qatar</option><option value="+968">🇴🇲 +968 Oman</option><option value="+965">🇰🇼 +965 Kuwait</option><option value="+27">🇿🇦 +27 South Africa</option><option value="+7">🇷🇺 +7 Russia/Kazakhstan</option></select><input name="mobileNumber" type="text" inputmode="numeric" autocomplete="tel-national" maxlength="15" placeholder="98765 43210"></div></label><label>PAN<input name="pan" maxlength="10"></label><label>TAN<input name="tan" maxlength="10"></label><label>CIN<input name="cin" maxlength="21"></label><label>GSTIN<input name="gstin" maxlength="15"></label><label class="full client-create-relation" id="admin-client-relation-wrap">Relationship to primary account<select name="relationship"><option value="">Select relationship</option><option>Spouse</option><option>Son</option><option>Daughter</option><option>Father</option><option>Mother</option><option>Brother</option><option>Sister</option><option>Grandfather</option><option>Grandmother</option><option>Grandson</option><option>Granddaughter</option><option>Other</option></select></label><label class="full">Filename aliases<input name="aliases" placeholder="Name variants, separated by commas"></label><label class="check"><input name="canUpload" type="checkbox"> Allow client uploads</label></div><div class="form-message" id="admin-client-message"></div><div class="modal-actions"><button type="button" class="secondary modal-close">Cancel</button><button class="primary" id="admin-client-submit" type="submit" disabled>Create profile</button></div></form></section>`;
  document.body.appendChild(m);
  m.querySelectorAll(".modal-close").forEach(b=>b.addEventListener("click",()=>m.remove()));

  const form=m.querySelector("#admin-client-create-form"),email=m.querySelector('[name="email"]'),check=m.querySelector("#admin-client-email-check"),status=m.querySelector("#admin-client-email-status"),primaryStatus=m.querySelector("#admin-client-primary-status"),relationWrap=m.querySelector("#admin-client-relation-wrap"),relation=m.querySelector('[name="relationship"]'),submit=m.querySelector("#admin-client-submit"),message=m.querySelector("#admin-client-message");
  let verifiedEmail="",linkedAccount=null;

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
    submit.disabled=true;message.textContent=linkedAccount?"Adding family profile under the existing primary login…":"Creating client login and sending the welcome email…";
    try{
      if(linkedAccount){
        await callFunction("manage-client-family",{action:"create_family_member",accountId:linkedAccount.accountId,relationship:clean(d.get("relationship")),...base});
        message.textContent="Family profile added successfully. No separate login was created.";
      }else{
        const result=await callFunction("create-client-account",{...base,email:verifiedEmail,canUpload:d.get("canUpload")==="on"});
        message.textContent=result.emailSent?"Client login created and welcome email sent successfully.":"Client login created, but the welcome email could not be sent.";
      }
      setTimeout(()=>{m.remove();document.getElementById("refresh-clients")?.click()},700);
    }catch(err){message.textContent=err.message;submit.disabled=false}
  });
}

document.addEventListener("click",e=>{const b=e.target.closest("#new-client");if(!b)return;e.preventDefault();e.stopImmediatePropagation();showAdminClientCreation()},true);
