import { createClient as createSupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

const supabase=createSupabaseClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
const path=location.pathname.replace(/\/+$/,"")||"/";
const route=/\/admin(?:\/|$)/.test(path)||path.endsWith("/admin/index.html")?"admin":"client";
const TAB_MARKER=`kka-tab-session:${route}`;
const LAST_ACTIVITY=`kka-last-activity:${route}`;
const INACTIVITY_MS=5*60*1000;
const WARNING_MS=30*1000;
const EVENTS=["pointerdown","keydown","touchstart","wheel"];
let lastActivity=0,timer=null,warningTimer=null,countdownTimer=null,loggedOut=false,listenersInstalled=false;

function clearTimers(){
  if(timer)clearTimeout(timer);
  if(warningTimer)clearTimeout(warningTimer);
  if(countdownTimer)clearInterval(countdownTimer);
  timer=warningTimer=countdownTimer=null;
}
function clearTabState(){try{sessionStorage.removeItem(TAB_MARKER);sessionStorage.removeItem(LAST_ACTIVITY)}catch{}}
function markTab(){try{sessionStorage.setItem(TAB_MARKER,String(Date.now()))}catch{}}
function setActivity(ts=Date.now()){lastActivity=ts;try{sessionStorage.setItem(LAST_ACTIVITY,String(ts))}catch{}}
function remainingMs(){return Math.max(0,INACTIVITY_MS-(Date.now()-lastActivity))}
function touch(){if(loggedOut)return;setActivity();removeWarning();schedule()}

function renderTimer(){
  const el=document.getElementById("kka-session-remaining");
  if(!el||!lastActivity)return;
  const ms=remainingMs();
  const total=Math.ceil(ms/1000);
  const min=Math.floor(total/60),sec=total%60;
  el.textContent=`${min}:${String(sec).padStart(2,"0")}`;
  el.setAttribute("aria-label",`Session expires in ${min} minutes ${sec} seconds`);
}
function injectTimer(){
  if(route==="root"||document.getElementById("kka-session-timer"))return;
  const box=document.createElement("div");
  box.id="kka-session-timer";
  box.innerHTML=`<span>Session</span><strong id="kka-session-remaining">5:00</strong>`;
  document.body.appendChild(box);
  renderTimer();
}
function removeWarning(){
  countdownTimer&&clearInterval(countdownTimer);countdownTimer=null;
  document.getElementById("kka-session-warning")?.remove();
}
function showWarning(){
  if(loggedOut||document.getElementById("kka-session-warning"))return;
  const box=document.createElement("div");
  box.id="kka-session-warning";
  box.setAttribute("role","alertdialog");
  box.setAttribute("aria-live","assertive");
  box.innerHTML=`<div class="kka-session-warning-card"><strong>Session expiring</strong><p>For security, you will be signed out in <span id="kka-session-countdown">30</span> seconds because there has been no activity.</p><div><button type="button" id="kka-session-stay">Stay signed in</button><button type="button" id="kka-session-now">Sign out now</button></div></div>`;
  document.body.appendChild(box);
  const update=()=>{
    const seconds=Math.max(0,Math.ceil(remainingMs()/1000));
    const el=document.getElementById("kka-session-countdown");
    if(el)el.textContent=String(seconds);
    if(seconds<=0){clearInterval(countdownTimer);countdownTimer=null;void finishLogout("inactivity")}
  };
  update();
  countdownTimer=setInterval(update,250);
  box.querySelector("#kka-session-stay")?.addEventListener("click",()=>{removeWarning();touch()});
  box.querySelector("#kka-session-now")?.addEventListener("click",()=>{removeWarning();void finishLogout("manual")});
}
function schedule(){
  if(loggedOut||!lastActivity)return;
  clearTimeout(timer);clearTimeout(warningTimer);
  const remaining=remainingMs();
  renderTimer();
  if(remaining<=0){void finishLogout("inactivity");return}
  warningTimer=setTimeout(showWarning,Math.max(0,remaining-WARNING_MS));
  timer=setTimeout(()=>finishLogout("inactivity"),remaining+50);
}
function checkIdle(){
  if(loggedOut||!lastActivity)return;
  renderTimer();
  if(remainingMs()<=0){void finishLogout("inactivity");return}
  if(remainingMs()<=WARNING_MS)showWarning();
  schedule();
}
async function finishLogout(reason){
  if(loggedOut)return;
  loggedOut=true;clearTimers();removeWarning();
  try{sessionStorage.setItem("kka-logout-reason",reason)}catch{}
  try{await supabase.auth.signOut({scope:"local"})}catch{}
  clearTabState();
  location.replace("../");
}
function injectStyles(){
  if(document.getElementById("kka-session-security-style"))return;
  const s=document.createElement("style");s.id="kka-session-security-style";
  s.textContent=`#kka-session-timer{position:fixed;right:14px;bottom:14px;z-index:9990;display:flex;align-items:center;gap:8px;padding:7px 10px;border:1px solid var(--border,#d5ddd8);border-radius:10px;background:var(--surface,#fff);color:var(--text,#18211d);box-shadow:0 6px 20px rgb(0 0 0/.08);font:12px system-ui,sans-serif}#kka-session-timer strong{font-variant-numeric:tabular-nums;font-size:13px}.kka-session-warning{font-family:system-ui,sans-serif}#kka-session-warning{position:fixed;inset:0;z-index:99999;display:grid;place-items:center;padding:20px;background:rgb(0 0 0/.48);backdrop-filter:blur(3px)}.kka-session-warning-card{width:min(460px,100%);padding:26px;border:1px solid var(--line,#d5ddd8);border-radius:16px;background:var(--surface,#fff);color:var(--text,#18211d);box-shadow:0 20px 60px rgb(0 0 0/.22)}.kka-session-warning-card strong{font-size:20px}.kka-session-warning-card p{margin:10px 0 20px;color:var(--text-muted,#66736c);line-height:1.55}.kka-session-warning-card div{display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap}.kka-session-warning-card button{border:1px solid var(--border,#d5ddd8);border-radius:10px;padding:9px 14px;background:var(--surface-2,#f5f7f6);color:var(--text,#18211d);cursor:pointer}.kka-session-warning-card #kka-session-stay{background:var(--accent,#285c43);color:#fff;border-color:var(--accent,#285c43)}@media(max-width:600px){#kka-session-timer{right:8px;bottom:8px;font-size:11px}}`;
  document.head.appendChild(s);
}
function installActivityListeners(){
  if(listenersInstalled)return;
  listenersInstalled=true;
  EVENTS.forEach(e=>document.addEventListener(e,touch,{passive:true,capture:true}));
  document.addEventListener("visibilitychange",()=>{if(!document.hidden)checkIdle()});
  window.addEventListener("focus",checkIdle);
  window.addEventListener("pageshow",checkIdle);
}
async function init(){
  injectStyles();
  if(route==="root")return;
  installActivityListeners();
  let tabMarker=null,lastStored=null;
  try{tabMarker=sessionStorage.getItem(TAB_MARKER);lastStored=sessionStorage.getItem(LAST_ACTIVITY)}catch{}
  const {data:{session}}=await supabase.auth.getSession();
  if(!session?.user){clearTimers();return}
  if(!tabMarker){
    try{sessionStorage.setItem("kka-logout-reason","browser-closed")}catch{}
    await supabase.auth.signOut({scope:"local"}).catch(()=>{});
    clearTabState();
    location.replace("../");
    return;
  }
  const parsed=Number(lastStored);
  if(Number.isFinite(parsed)&&parsed>0)lastActivity=parsed;else setActivity();
  if(remainingMs()<=0){await finishLogout("inactivity");return}
  injectTimer();
  schedule();
}
window.KKASessionSignOut=()=>finishLogout("manual");
window.KKASessionManualLogout=()=>finishLogout("manual");
supabase.auth.onAuthStateChange((event,session)=>{
  if(route==="root")return;
  if(!session?.user){clearTimers();return}
  if(event==="SIGNED_IN"){
    if(!sessionStorage.getItem(TAB_MARKER))markTab();
    if(!loggedOut){lastActivity=Date.now();setActivity(lastActivity);injectTimer();schedule()}
    return;
  }
  if(!loggedOut&&!lastActivity){
    const stored=Number(sessionStorage.getItem(LAST_ACTIVITY)||0);
    lastActivity=stored||Date.now();
    if(!stored)setActivity(lastActivity);
    injectTimer();schedule();
  }
});
void init();
