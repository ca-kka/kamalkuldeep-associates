import { createClient as createSupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

const supabase=createSupabaseClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
const path=location.pathname.replace(/\/+$/,"")||"/";
// The client portal is served from the root path, while the admin portal is
// served from /admin/. Do not depend on rendered DOM here: this module loads
// before app.js has cloned the portal template.
const route=/\/admin(?:\/|$)/.test(path)||path.endsWith("/admin/index.html")?"admin":"client";
const TAB_MARKER=`kka-tab-session:${route}`;
const LAST_ACTIVITY=`kka-last-activity:${route}`;
const INACTIVITY_MS=5*60*1000,WARNING_MS=30*1000;
const EVENTS=["pointerdown","keydown","touchstart","wheel"];
let lastActivity=0,timer=null,warningTimer=null,loggedOut=false,listenersInstalled=false;

function clearTimers(){if(timer)clearTimeout(timer);if(warningTimer)clearTimeout(warningTimer);timer=warningTimer=null}
function clearTabState(){try{sessionStorage.removeItem(TAB_MARKER);sessionStorage.removeItem(LAST_ACTIVITY)}catch{}}
function markTab(){try{sessionStorage.setItem(TAB_MARKER,String(Date.now()))}catch{}}
function setActivity(ts=Date.now()){lastActivity=ts;try{sessionStorage.setItem(LAST_ACTIVITY,String(ts))}catch{}}
function touch(){if(loggedOut||route==="root")return;setActivity();schedule()}
function schedule(){
  if(route==="root"||loggedOut)return;
  clearTimers();
  const remaining=Math.max(0,INACTIVITY_MS-(Date.now()-lastActivity));
  warningTimer=setTimeout(showWarning,Math.max(0,remaining-WARNING_MS));
  timer=setTimeout(()=>finishLogout("inactivity"),remaining);
}
function checkIdle(){
  if(route==="root"||loggedOut||!lastActivity)return;
  if(Date.now()-lastActivity>=INACTIVITY_MS){void finishLogout("inactivity");return}
  schedule();
}
function showWarning(){
  if(loggedOut||route==="root"||document.getElementById("kka-session-warning"))return;
  const box=document.createElement("div");
  box.id="kka-session-warning";
  box.setAttribute("role","alertdialog");
  box.setAttribute("aria-live","assertive");
  box.innerHTML=`<div class="kka-session-warning-card"><strong>Session expiring</strong><p>For security, the portal will automatically sign you out in <span id="kka-session-countdown">30</span> seconds because there has been no activity.</p><div><button type="button" id="kka-session-stay">Stay signed in</button><button type="button" id="kka-session-now">Sign out now</button></div></div></div>`;
  document.body.appendChild(box);
  let seconds=30;
  const interval=setInterval(()=>{seconds--;const el=document.getElementById("kka-session-countdown");if(el)el.textContent=String(Math.max(0,seconds));if(seconds<=0)clearInterval(interval)},1000);
  box.querySelector("#kka-session-stay")?.addEventListener("click",()=>{clearInterval(interval);box.remove();touch()});
  box.querySelector("#kka-session-now")?.addEventListener("click",()=>{clearInterval(interval);box.remove();finishLogout("manual")});
}
async function finishLogout(reason){
  if(loggedOut||route==="root")return;
  loggedOut=true;clearTimers();
  try{sessionStorage.setItem("kka-logout-reason",reason)}catch{}
  try{await supabase.auth.signOut()}catch{}
  clearTabState();
  location.replace("../");
}
function injectStyles(){
  if(document.getElementById("kka-session-security-style"))return;
  const s=document.createElement("style");s.id="kka-session-security-style";
  s.textContent=`#kka-session-warning{position:fixed;inset:0;z-index:99999;display:grid;place-items:center;padding:20px;background:rgb(0 0 0 / .48);backdrop-filter:blur(3px)}.kka-session-warning-card{width:min(460px,100%);padding:26px;border:1px solid var(--line);border-radius:16px;background:var(--surface);color:var(--text);box-shadow:0 20px 60px rgb(0 0 0 / .22)}.kka-session-warning-card strong{font-size:20px}.kka-session-warning-card p{margin:10px 0 20px;color:var(--text-muted);line-height:1.55}.kka-session-warning-card div{display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap}.kka-session-warning-card button{border:1px solid var(--border);border-radius:10px;padding:9px 14px;background:var(--surface-2);color:var(--text);cursor:pointer}.kka-session-warning-card #kka-session-stay{background:var(--accent);color:#fff;border-color:var(--accent)}`;
  document.head.appendChild(s);
}
function installActivityListeners(){
  if(route==="root"||listenersInstalled)return;
  listenersInstalled=true;
  EVENTS.forEach(e=>document.addEventListener(e,touch,{passive:true,capture:true}));
  // Mobile browsers may throttle timers while a tab is backgrounded. Never
  // treat returning to the portal as activity; first enforce the elapsed idle time.
  document.addEventListener("visibilitychange",()=>{if(!document.hidden)checkIdle()});
  window.addEventListener("focus",checkIdle);
}
function installManualLogoutCapture(){
  if(route==="root")return;
  document.addEventListener("click",e=>{
    const target=e.target.closest?.("#client-signout,[data-profile-action=signout],button.user[title=\"Sign out\"]");
    if(!target)return;
    e.preventDefault();e.stopImmediatePropagation();finishLogout("manual");
  },true);
}
async function init(){
  injectStyles();
  if(route==="root")return;
  installActivityListeners();installManualLogoutCapture();
  let tabMarker=null,lastStored=null;
  try{tabMarker=sessionStorage.getItem(TAB_MARKER);lastStored=sessionStorage.getItem(LAST_ACTIVITY)}catch{}
  const {data:{session}}=await supabase.auth.getSession();
  if(!session?.user){clearTimers();return}
  if(!tabMarker)markTab();
  const parsed=Number(lastStored);
  if(Number.isFinite(parsed)&&parsed>0)lastActivity=parsed;else setActivity();
  if(Date.now()-lastActivity>=INACTIVITY_MS){await finishLogout("inactivity");return}
  schedule();
}
supabase.auth.onAuthStateChange((event,session)=>{
  if(route==="root")return;
  if(!session?.user){clearTimers();return}
  if(event==="SIGNED_IN"){
    if(!sessionStorage.getItem(TAB_MARKER))markTab();
    if(!loggedOut){lastActivity=Date.now();setActivity(lastActivity);schedule()}
    return;
  }
  if(!loggedOut&&!lastActivity){
    const stored=Number(sessionStorage.getItem(LAST_ACTIVITY)||0);
    lastActivity=stored||Date.now();
    if(!stored)setActivity(lastActivity);
    schedule();
  }
});
window.KKASessionManualLogout=()=>finishLogout("manual");
void init();
