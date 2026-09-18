import { createClient as createSupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

const supabase=createSupabaseClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
const path=location.pathname.replace(/\/+$/,"")||"/";
const route=path.endsWith("/admin")?"admin":path.endsWith("/client")?"client":"root";
const TAB_MARKER=`kka-tab-session:${route}`;
const LAST_ACTIVITY=`kka-last-activity:${route}`;
const INACTIVITY_MS=5*60*1000,WARNING_MS=30*1000;
const EVENTS=["pointerdown","pointermove","keydown","touchstart","wheel","scroll"];
let lastActivity=Date.now(),timer=null,warningTimer=null,loggedOut=false,listenersInstalled=false;

function clearTimers(){if(timer)clearTimeout(timer);if(warningTimer)clearTimeout(warningTimer);timer=warningTimer=null}
function clearTabState(){try{sessionStorage.removeItem(TAB_MARKER);localStorage.removeItem(LAST_ACTIVITY)}catch{}}
function markTabActive(){try{sessionStorage.setItem(TAB_MARKER,String(Date.now()));localStorage.setItem(LAST_ACTIVITY,String(Date.now()))}catch{}}
function touch(){if(loggedOut||route==="root")return;lastActivity=Date.now();markTabActive();schedule()}
function schedule(){if(route==="root")return;clearTimers();const remaining=Math.max(0,INACTIVITY_MS-(Date.now()-lastActivity));warningTimer=setTimeout(showWarning,Math.max(0,remaining-WARNING_MS));timer=setTimeout(autoLogout,remaining)}

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
  box.querySelector("#kka-session-stay")?.addEventListener("click",()=>{box.remove();touch()});
  box.querySelector("#kka-session-now")?.addEventListener("click",()=>{box.remove();manualLogout()});
}

async function finishLogout(reason){
  if(loggedOut||route==="root")return;
  loggedOut=true;
  clearTimers();
  try{sessionStorage.setItem("kka-logout-reason",reason)}catch{}
  try{await supabase.auth.signOut()}catch{}
  clearTabState();
  location.replace('../');
}
async function autoLogout(){await finishLogout("inactivity")}
async function manualLogout(){await finishLogout("manual")}

function injectStyles(){
  if(document.getElementById("kka-session-security-style"))return;
  const s=document.createElement("style");
  s.id="kka-session-security-style";
  s.textContent=`#kka-session-warning{position:fixed;inset:0;z-index:99999;display:grid;place-items:center;padding:20px;background:rgb(0 0 0 / .48);backdrop-filter:blur(3px)}.kka-session-warning-card{width:min(460px,100%);padding:26px;border:1px solid var(--line);border-radius:16px;background:var(--surface);color:var(--text);box-shadow:0 20px 60px rgb(0 0 0 / .22)}.kka-session-warning-card strong{font-size:20px}.kka-session-warning-card p{margin:10px 0 20px;color:var(--text-muted);line-height:1.55}.kka-session-warning-card div{display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap}.kka-session-warning-card button{border:1px solid var(--border);border-radius:10px;padding:9px 14px;background:var(--surface-2);color:var(--text);cursor:pointer}.kka-session-warning-card #kka-session-stay{background:var(--accent);color:#fff;border-color:var(--accent)}`;
  document.head.appendChild(s)
}
function installActivityListeners(){
  if(route==="root"||listenersInstalled)return;
  listenersInstalled=true;
  EVENTS.forEach(e=>document.addEventListener(e,touch,{passive:true,capture:true}))
}
function installManualLogoutCapture(){
  if(route==="root")return;
  document.addEventListener("click",e=>{
    const target=e.target.closest?.("#client-signout,[data-profile-action=signout],button.user[title=\"Sign out\"]");
    if(!target)return;
    e.preventDefault();
    e.stopImmediatePropagation();
    manualLogout();
  },true)
}

function init(){
  injectStyles();
  if(route==="root")return;
  installActivityListeners();
  installManualLogoutCapture();

  let tabMarker=null;
  try{tabMarker=sessionStorage.getItem(TAB_MARKER)}catch{}

  supabase.auth.getSession().then(async({data:{session}})=>{
    if(!session?.user){clearTimers();return}

    // sessionStorage survives reloads but is destroyed when the tab/browser is closed.
    // Therefore a protected page with no tab marker is a previously closed session.
    if(!tabMarker){
      try{sessionStorage.setItem("kka-logout-reason","browser-close")}catch{}
      await supabase.auth.signOut();
      clearTabState();
      location.reload();
      return;
    }

    lastActivity=Date.now();
    markTabActive();
    schedule();
  }).catch(()=>{})
}

supabase.auth.onAuthStateChange((_event,session)=>{
  if(route==="root")return;
  if(!session?.user){clearTimers();return}
  if(!loggedOut){lastActivity=Date.now();markTabActive();schedule()}
});

window.KKASessionManualLogout=manualLogout;
init();
