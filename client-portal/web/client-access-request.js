import { createClient as createSupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

const supabase=createSupabaseClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
const esc=v=>String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
const clean=v=>String(v??"").trim();
let setupDone=false;

function modal(inner){
  const m=document.createElement("div");
  m.className="modal-backdrop client-access-modal-backdrop";
  m.innerHTML=`<section class="modal compact-modal" role="dialog" aria-modal="true">${inner}</section>`;
  document.body.appendChild(m);
  m.querySelectorAll(".modal-close").forEach(b=>b.addEventListener("click",()=>m.remove()));
  return m;
}

function showRequestForm(email){
  const m=modal(`<div class="modal-head"><div><p class="eyebrow">KAMAL KULDEEP &amp; ASSOCIATES</p><h2>Request Portal Access</h2><p class="muted">Submit a requisition for Client Portal access. KKA will review the request before an account is created.</p></div><button class="modal-close" type="button">×</button></div><form id="portal-access-request-form" class="form-grid"><label>Full name<input name="fullName" required maxlength="200" autocomplete="name"></label><label>Email<input name="email" type="email" required readonly value="${esc(email)}"></label><label>Mobile<input name="mobile" type="tel" maxlength="20" autocomplete="tel"></label><label>Client / business name<input name="clientName" maxlength="200"></label><label>PAN<input name="pan" maxlength="10" autocomplete="off"></label><label>GSTIN<input name="gstin" maxlength="15" autocomplete="off"></label><label>TAN<input name="tan" maxlength="10" autocomplete="off"></label><label>CIN<input name="cin" maxlength="21" autocomplete="off"></label><label>Relationship<input name="relationship" maxlength="100" placeholder="Director / Partner / Proprietor / Authorized person"></label><label class="full">Reason for requesting access<textarea name="reason" required maxlength="1000" rows="4" placeholder="Please explain why portal access is required."></textarea></label><label class="full">Additional message<textarea name="message" maxlength="3000" rows="3" placeholder="Optional"></textarea></label><div class="form-message full" id="portal-access-message">The request will be recorded with its submission date and time.</div><div class="modal-actions full"><button type="button" class="secondary modal-close">Cancel</button><button type="submit" class="primary">Submit Access Request</button></div></form>`);
  m.querySelector("#portal-access-request-form").addEventListener("submit",async e=>{
    e.preventDefault();
    const f=new FormData(e.currentTarget),msg=m.querySelector("#portal-access-message"),submit=e.currentTarget.querySelector("button[type=submit]");
    const payload={p_email:email,p_full_name:clean(f.get("fullName")),p_mobile:clean(f.get("mobile")),p_pan:clean(f.get("pan")),p_gstin:clean(f.get("gstin")),p_tan:clean(f.get("tan")),p_cin:clean(f.get("cin")),p_client_name:clean(f.get("clientName")),p_relationship:clean(f.get("relationship")),p_reason:clean(f.get("reason")),p_message:clean(f.get("message"))};
    submit.disabled=true;msg.textContent="Submitting request…";
    const {data,error}=await supabase.rpc("submit_portal_access_request",payload);
    if(error){msg.textContent=error.message||"The access request could not be submitted.";submit.disabled=false;return;}
    const stamp=new Intl.DateTimeFormat("en-IN",{dateStyle:"medium",timeStyle:"medium",timeZone:"Asia/Kolkata"}).format(new Date());
    m.querySelector(".modal-head").innerHTML=`<div><p class="eyebrow">REQUEST RECEIVED</p><h2>Access request submitted</h2><p class="muted">KAMAL KULDEEP &amp; ASSOCIATES will review the requisition before creating portal access.</p></div>`;
    e.currentTarget.innerHTML=`<div class="profile-card"><div><strong>Request Reference</strong><p>${esc(data)}</p><span class="pill success">Submitted · ${esc(stamp)} IST</span></div></div><p class="muted small">Please retain this reference for your records. If approved, an account activation email will be sent to <strong>${esc(email)}</strong>.</p><div class="modal-actions"><button type="button" class="primary modal-close">Close</button></div>`;
    m.querySelectorAll(".modal-close").forEach(b=>b.addEventListener("click",()=>m.remove()));
  });
}

async function setup(){
  const form=document.querySelector("#login-form");
  if(!form||setupDone)return;
  setupDone=true;
  const email=form.querySelector("#email"),password=form.querySelector("#password"),message=form.querySelector("#auth-message"),submit=form.querySelector('button[type="submit"]');
  password.hidden=true;password.required=false;submit.disabled=true;submit.textContent="Continue";
  const check=document.createElement("button");check.type="button";check.className="secondary";check.textContent="Continue";check.id="portal-email-check";submit.replaceWith(check);
  let checkedEmail="";
  check.addEventListener("click",async()=>{
    const value=clean(email.value).toLowerCase();
    if(!value||!email.checkValidity()){message.textContent="Enter a valid email address first.";return;}
    check.disabled=true;message.textContent="Checking portal access…";
    const {data,error}=await supabase.rpc("portal_email_status",{p_email:value});
    if(error||!data?.valid){message.textContent=error?.message||"Email could not be checked.";check.disabled=false;return;}
    checkedEmail=value;email.readOnly=true;
    if(data.registered){
      password.hidden=false;password.required=true;password.focus();check.textContent="Sign in";check.className="primary";message.textContent="Email is registered. Enter the portal password to continue.";
      check.onclick=()=>form.requestSubmit();
    }else{
      password.hidden=true;password.required=false;check.textContent="Request Portal Access";check.className="primary";message.textContent="This email is not registered for the KKA Client Portal. Request access from KKA to obtain an account.";
      check.onclick=()=>showRequestForm(checkedEmail);
    }
  });
  email.addEventListener("input",()=>{if(email.readOnly)return;check.disabled=false;message.textContent="";});
  form.addEventListener("submit",e=>{if(!password.required){e.preventDefault();e.stopImmediatePropagation();}},true);
}

const observer=new MutationObserver(()=>{if(document.querySelector("#login-form")){observer.disconnect();setup();}});
observer.observe(document.querySelector("#app")||document.body,{childList:true,subtree:true});
setTimeout(()=>{if(document.querySelector("#login-form")){observer.disconnect();setup();}},0);
