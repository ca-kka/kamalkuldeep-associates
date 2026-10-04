import {createClient as createSupabaseClient} from "https://esm.sh/@supabase/supabase-js@2";
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from "./config.js";
const supabase=createSupabaseClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
const esc=v=>String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
const STATE=window.__KKA_CLIENT_PROFILE_MENU__||(window.__KKA_CLIENT_PROFILE_MENU__={installing:false,observer:null,outsideBound:false});

function styles(){
 if(document.getElementById("kka-client-profile-menu-style"))return;
 const s=document.createElement("style");s.id="kka-client-profile-menu-style";s.textContent=`
.client-profile-menu{position:relative;display:inline-flex;flex:0 0 auto;margin-left:auto;z-index:20}
.client-profile-trigger{display:inline-flex;align-items:center;gap:9px;border:1px solid var(--line);background:var(--panel,var(--white));color:var(--ink);padding:8px 12px;border-radius:10px;cursor:pointer;min-height:40px;box-shadow:none}
.client-profile-trigger:hover{border-color:var(--forest);background:var(--soft)}
.client-profile-trigger:focus-visible{outline:2px solid var(--forest);outline-offset:2px}
.client-profile-avatar{width:27px;height:27px;border-radius:50%;display:grid;place-items:center;background:var(--soft);border:1px solid var(--line);font-size:11px;font-weight:700;flex:0 0 auto}
.client-profile-name{font-weight:700;font-size:13px;line-height:1}.client-profile-role{font-size:11px;color:var(--muted);line-height:1}
.client-profile-dropdown{position:absolute;right:0;top:calc(100% + 7px);z-index:1000;min-width:205px;padding:6px;border:1px solid var(--line);border-radius:11px;background:var(--panel,var(--white));box-shadow:0 12px 30px rgba(0,0,0,.18)}
.client-profile-dropdown button{display:block;width:100%;padding:10px 11px;border:0;background:transparent;text-align:left;border-radius:7px;color:var(--ink);cursor:pointer;font:600 13px inherit}.client-profile-dropdown button:hover{background:var(--soft)}.client-profile-divider{height:1px;background:var(--line);margin:5px 0}
@media(max-width:600px){.client-profile-name{display:none}.client-profile-trigger{padding:7px 9px}}
`;
 document.head.appendChild(s);
}

async function context(){
 const {data:{user}}=await supabase.auth.getUser();if(!user)return null;
 const {data:p}=await supabase.from("profiles").select("role,full_name,active").eq("id",user.id).maybeSingle();
 if(p?.role!=="client"||!p.active)return null;
 const {data:m}=await supabase.from("client_memberships").select("client_id,can_upload").eq("user_id",user.id).maybeSingle();if(!m?.client_id)return null;
 const {data:c}=await supabase.from("clients").select("id,legal_name,display_name,pan,gstin,mobile,active").eq("id",m.client_id).maybeSingle();
 return c?{user,p,m,c}:null;
}

function closeAll(){document.querySelectorAll(".client-profile-dropdown:not([hidden])").forEach(x=>{x.hidden=true;x.parentElement?.querySelector(".client-profile-trigger")?.setAttribute("aria-expanded","false")})}
function modal(html){const m=document.createElement("div");m.className="modal-backdrop";m.innerHTML=html;document.body.appendChild(m);m.querySelectorAll(".modal-close").forEach(b=>b.onclick=()=>m.remove());return m}
function profileModal(c){const name=c.p.full_name||c.c.display_name||c.c.legal_name||"Client";const m=modal(`<section class="modal compact-modal client-profile-modal" role="dialog" aria-modal="true"><div class="modal-head"><div><p class="eyebrow">CLIENT PROFILE</p><h2>My Profile</h2><p class="muted">Signed-in KKA Client Portal account</p></div><button class="modal-close" type="button">×</button></div><div class="profile-card"><div class="profile-avatar-large">${esc(name.slice(0,1).toUpperCase())}</div><div><strong>${esc(name)}</strong><p class="muted">${esc(c.user.email||"Not available")}</p><span class="pill success">Client · Active</span></div></div><div class="profile-details"><div><span>Full name</span><strong>${esc(name)}</strong></div><div><span>Login email</span><strong>${esc(c.user.email||"—")}</strong></div><div><span>Client profile</span><strong>${esc(c.c.legal_name||"—")}</strong></div><div><span>PAN</span><strong>${esc(c.c.pan||"—")}</strong></div><div><span>Mobile</span><strong>${esc(c.c.mobile||"—")}</strong></div></div><div class="modal-actions"><button class="secondary modal-close">Close</button><button class="primary" id="client-profile-edit">Edit profile</button></div></section>`);m.querySelector("#client-profile-edit").onclick=()=>{m.remove();editModal(c)}}
function editModal(c){const m=modal(`<section class="modal compact-modal" role="dialog" aria-modal="true"><div class="modal-head"><div><p class="eyebrow">CLIENT PROFILE</p><h2>Edit Profile</h2><p class="muted">Update your contact details and login email.</p></div><button class="modal-close" type="button">×</button></div><form id="client-edit-form" class="form-grid"><label class="full">Full name<input name="fullName" required maxlength="200" value="${esc(c.p.full_name||"")}"></label><label class="full">Mobile<input name="mobile" maxlength="20" value="${esc(c.c.mobile||"")}"></label><label class="full">Login email<input name="email" type="email" required value="${esc(c.user.email||"")}" autocomplete="email"></label><p class="muted small full">Legal name, PAN and tax registrations are maintained by KKA.</p><div class="form-message full" id="client-edit-message"></div><div class="modal-actions full"><button type="button" class="secondary modal-close">Cancel</button><button class="primary" type="submit">Save changes</button></div></form></section>`);m.querySelector("#client-edit-form").onsubmit=async e=>{e.preventDefault();const d=new FormData(e.currentTarget),msg=m.querySelector("#client-edit-message");msg.textContent="Saving…";try{const {data:{session}}=await supabase.auth.getSession();if(!session?.access_token)throw new Error("Your session has expired. Please sign in again.");const r=await fetch(SUPABASE_URL+"/functions/v1/update-client-self-profile",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+session.access_token},body:JSON.stringify({action:"update",fullName:String(d.get("fullName")||"").trim(),mobile:String(d.get("mobile")||"").trim(),email:String(d.get("email")||"").trim().toLowerCase()})});const out=await r.json().catch(()=>({}));if(!r.ok)throw new Error(out.error||"Profile could not be updated.");m.remove();window.KKANotify?.success?.("Profile updated successfully.");window.KKAClientDashboardRender?.()}catch(err){msg.textContent=err.message||"Profile could not be updated."}}}
function passwordModal(){const m=modal(`<section class="modal compact-modal" role="dialog" aria-modal="true"><div class="modal-head"><div><p class="eyebrow">SECURITY</p><h2>Change Password</h2><p class="muted">Set a new password for your KKA Client Portal account.</p></div><button class="modal-close" type="button">×</button></div><form id="client-password-form" class="form-grid"><label class="full">New password<input name="password" type="password" minlength="10" maxlength="72" required autocomplete="new-password"></label><label class="full">Confirm new password<input name="confirm" type="password" minlength="10" maxlength="72" required autocomplete="new-password"></label><div class="form-message full">Use a strong password of at least 10 characters.</div><div class="modal-actions full"><button type="button" class="secondary modal-close">Cancel</button><button class="primary" type="submit">Change password</button></div></form></section>`);m.querySelector("#client-password-form").onsubmit=async e=>{e.preventDefault();const d=new FormData(e.currentTarget),p=String(d.get("password")||""),q=String(d.get("confirm")||""),msg=m.querySelector(".form-message");if(p!==q){msg.textContent="Passwords do not match.";return}msg.textContent="Updating password…";try{const {data:{session}}=await supabase.auth.getSession();if(!session?.access_token)throw new Error("Your session has expired. Please sign in again.");const r=await fetch(SUPABASE_URL+"/functions/v1/update-client-self-profile",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+session.access_token},body:JSON.stringify({action:"password",password:p})});const out=await r.json().catch(()=>({}));if(!r.ok)throw new Error(out.error||"Password could not be changed.");m.remove();window.KKANotify?.success?.("Password changed successfully")}catch(err){msg.textContent=err.message||"Password could not be changed."}}}

async function install(){
 if(STATE.installing)return;
 const existing=document.querySelectorAll(".client-profile-menu");
 if(existing.length>1){existing.forEach((x,i)=>{if(i>0)x.remove()});return}
 if(existing.length===1)return;
 const header=document.querySelector(".portal-main header");if(!header)return;
 STATE.installing=true;
 try{
  styles();
  const c=await context();if(!c)return;
  const dup=document.querySelectorAll(".client-profile-menu");if(dup.length){dup.forEach((x,i)=>{if(i>0)x.remove()});if(dup.length===1)return}
  const name=c.p.full_name||c.c.display_name||c.c.legal_name||"Client";
  const existingSignout=document.getElementById("client-signout");
  const wrap=document.createElement("div");wrap.className="client-profile-menu";wrap.innerHTML=`<button class="user client-profile-trigger" type="button" aria-expanded="false" aria-haspopup="menu"><span class="client-profile-avatar">${esc(name.slice(0,1).toUpperCase())}</span><span class="client-profile-name">${esc(name)}</span><span class="client-profile-role">Client ▾</span></button><div class="client-profile-dropdown" hidden role="menu"><button data-action="view" type="button">My Profile</button><button data-action="edit" type="button">Edit Profile</button><button data-action="password" type="button">Change Password</button><div class="client-profile-divider"></div><button data-action="signout" type="button">Sign out</button></div>`;
  if(existingSignout)existingSignout.replaceWith(wrap);else{const actions=header.querySelector(".page-actions");(actions||header).appendChild(wrap)}
  const t=wrap.querySelector(".client-profile-trigger"),menu=wrap.querySelector(".client-profile-dropdown");
  t.onclick=e=>{e.stopPropagation();const open=menu.hidden;closeAll();menu.hidden=!open;t.setAttribute("aria-expanded",String(open))};
  wrap.querySelector('[data-action="view"]').onclick=()=>{menu.hidden=true;profileModal(c)};
  wrap.querySelector('[data-action="edit"]').onclick=()=>{menu.hidden=true;editModal(c)};
  wrap.querySelector('[data-action="password"]').onclick=()=>{menu.hidden=true;passwordModal()};
  wrap.querySelector('[data-action="signout"]').onclick=async()=>{await supabase.auth.signOut();location.reload()};
  if(!STATE.outsideBound){document.addEventListener("click",closeAll);STATE.outsideBound=true}
 }finally{STATE.installing=false}
}
function boot(){styles();if(STATE.observer)STATE.observer.disconnect();STATE.observer=new MutationObserver(()=>install().catch(()=>{}));STATE.observer.observe(document.body,{childList:true,subtree:true});install().catch(()=>{})}
boot();