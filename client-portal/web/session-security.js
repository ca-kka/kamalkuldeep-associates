import { createClient as createSupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";
import { hasActivePortalPeer, registerPortalTab } from "./portal-tab-session.js?v=20261009-multitab1";

const supabase=createSupabaseClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
const path=location.pathname.replace(/\/+$/,"")||"/";
const route=/\/admin(?:\/|$)/.test(path)||path.endsWith("/admin/index.html")?"admin":"client";
const TAB_MARKER=`kka-tab-session:${route}`;
const LAST_ACTIVITY=`kka-last-activity:${route}`;
const TAB_ID_KEY=`kka-tab-id:${route}`;
const TAB_CLOSE_KEY=`kka-tab-closed:${route}`;
const TAB_HEARTBEAT_KEY=`kka-tab-heartbeat:${route}`;
const HEARTBEAT_MS=2000;
const INACTIVITY_MS=5*60*1000;
const WARNING_MS=30*1000;
const EVENTS=["pointerdown","keydown","touchstart","wheel"];
let lastActivity=0,timer=null,warningTimer=null,countdownTimer=null,heartbeatTimer=null,displayTimer=null,loggedOut=false,listenersInstalled=false,tabId=null,activityKey=null,sessionReady=false;

function clearTimers(){
  if(timer)clearTimeout(timer);
  if(warningTimer)clearTimeout(warningTimer);
  if(countdownTimer)clearInterval(countdownTimer);
  if(displayTimer)clearInterval(displayTimer);
  timer=warningTimer=countdownTimer=displayTimer=null;
}
function clearTabState(){try{sessionStorage.removeItem(TAB_MARKER);sessionStorage.removeItem(LAST_ACTIVITY)}catch{}}
function ensureTabId(){
  try{
    tabId=sessionStorage.getItem(TAB_ID_KEY);
    if(!tabId){
      tabId=crypto.randomUUID?.()||`tab-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      sessionStorage.setItem(TAB_ID_KEY,tabId);
    }
  }catch{}
  return tabId;
}
function clearLifecycleMarkers(){
  try{
    localStorage.removeItem(TAB_CLOSE_KEY);
    if(tabId)localStorage.removeItem(`${TAB_HEARTBEAT_KEY}:${tabId}`);
  }catch{}
}
function heartbeat(){
  if(!tabId||loggedOut)return;
  try{localStorage.setItem(`${TAB_HEARTBEAT_KEY}:${tabId}`,String(Date.now()))}catch{}
}
function startHeartbeat(){
  if(heartbeatTimer||!tabId)return;
  heartbeat();
  heartbeatTimer=setInterval(heartbeat,HEARTBEAT_MS);
}
function stopHeartbeat(){
  if(heartbeatTimer)clearInterval(heartbeatTimer);
  heartbeatTimer=null;
}
function markTabLeaving(){
  if(loggedOut||!sessionReady||!tabId||hasActivePortalPeer(route,tabId))return;
  try{localStorage.setItem(TAB_CLOSE_KEY,JSON.stringify({tabId,at:Date.now(),kind:"pagehide"}))}catch{}
}
function navigationType(){
  try{return performance.getEntriesByType("navigation")?.[0]?.type||"navigate"}catch{return"navigate"}
}
function syncSharedActivity(){
  if(!activityKey)return;
  try{
    const shared=Number(localStorage.getItem(activityKey)||0);
    if(Number.isFinite(shared)&&shared>lastActivity){
      lastActivity=shared;
      sessionStorage.setItem(LAST_ACTIVITY,String(shared));
    }
  }catch{}
}
function setActivity(ts=Date.now()){
  lastActivity=ts;
  try{sessionStorage.setItem(LAST_ACTIVITY,String(ts))}catch{}
  if(activityKey)try{localStorage.setItem(activityKey,String(ts))}catch{}
}
function remainingMs(){syncSharedActivity();return Math.max(0,INACTIVITY_MS-(Date.now()-lastActivity))}
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
  try{if(activityKey)localStorage.removeItem(activityKey)}catch{}
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
  document.addEventListener("visibilitychange",()=>{
    // A background tab is still open. Keep its lease alive; only pagehide can
    // mark a tab closed.
    if(!document.hidden&&sessionReady){clearLifecycleMarkers();startHeartbeat();checkIdle();}
  });
  window.addEventListener("pagehide",event=>{if(!event.persisted)markTabLeaving();});
  window.addEventListener("focus",()=>{if(!sessionReady)return;clearLifecycleMarkers();startHeartbeat();checkIdle()});
  window.addEventListener("pageshow",event=>{
    if(!sessionReady)return;
    if(event.persisted)clearLifecycleMarkers();
    startHeartbeat();
    checkIdle();
  });
  window.addEventListener("storage",event=>{
    if(!activityKey||event.key!==activityKey)return;
    const timestamp=Number(event.newValue||0);
    if(Number.isFinite(timestamp)&&timestamp>lastActivity){
      lastActivity=timestamp;
      try{sessionStorage.setItem(LAST_ACTIVITY,String(timestamp))}catch{}
      removeWarning();
      schedule();
    }
  });
}
async function init(){
  injectStyles();
  if(route==="root")return;
  ensureTabId();
  installActivityListeners();
  let tabMarker=null,lastStored=null;
  try{tabMarker=sessionStorage.getItem(TAB_MARKER);lastStored=sessionStorage.getItem(LAST_ACTIVITY)}catch{}
  const {data:{session}}=await supabase.auth.getSession();
  if(!session?.user){clearTimers();stopHeartbeat();return}
  activityKey=`kka-last-activity:${route}:${session.user.id}`;
  const closeRaw=(()=>{try{return localStorage.getItem(TAB_CLOSE_KEY)}catch{return null}})();
  let closeAt=Number.POSITIVE_INFINITY;
  try{
    const timestamp=Number(JSON.parse(closeRaw||"null")?.at);
    if(Number.isFinite(timestamp)&&timestamp>0)closeAt=timestamp;
  }catch{}
  const markerTime=Number(tabMarker||0);
  const signedInAfterClose=markerTime>0&&markerTime>closeAt;
  const hasPeer=()=>hasActivePortalPeer(route,tabId);
  if(closeRaw&&navigationType()==="navigate"&&!signedInAfterClose&&!hasPeer()){
    try{sessionStorage.setItem("kka-logout-reason","browser-closed")}catch{}
    await supabase.auth.signOut({scope:"local"}).catch(()=>{});
    clearLifecycleMarkers();
    clearTabState();
    location.replace("../");
    return;
  }
  if(!tabMarker){
    if(!hasPeer()){
      try{sessionStorage.setItem("kka-logout-reason","browser-closed")}catch{}
      await supabase.auth.signOut({scope:"local"}).catch(()=>{});
      clearLifecycleMarkers();
      clearTabState();
      location.replace("../");
      return;
    }
    tabId=registerPortalTab(route,{updateMarker:true})||tabId;
    tabMarker=sessionStorage.getItem(TAB_MARKER);
  }else{
    tabId=registerPortalTab(route,{updateMarker:false})||tabId;
  }
  sessionReady=true;
  clearLifecycleMarkers();
  startHeartbeat();
  const parsed=Number(lastStored||0);
  let shared=0;
  try{shared=Number(localStorage.getItem(activityKey)||0)}catch{}
  lastActivity=Math.max(Number.isFinite(parsed)?parsed:0,Number.isFinite(shared)?shared:0);
  if(lastActivity>0){try{sessionStorage.setItem(LAST_ACTIVITY,String(lastActivity))}catch{}}
  else setActivity();
  if(remainingMs()<=0){await finishLogout("inactivity");return}
  injectTimer();
  if(!displayTimer)displayTimer=setInterval(()=>{if(!loggedOut)renderTimer()},250);
  schedule();
}
window.addEventListener("pagehide",event=>{if(!event.persisted)markTabLeaving();});
window.KKASessionSignOut=()=>finishLogout("manual");
window.KKASessionManualLogout=()=>finishLogout("manual");
supabase.auth.onAuthStateChange((event,session)=>{
  if(route==="root")return;
  if(session?.user)activityKey=`kka-last-activity:${route}:${session.user.id}`;
  if(!session?.user){
    clearTimers();stopHeartbeat();
    if(event==="SIGNED_OUT"&&!loggedOut&&sessionReady){
      loggedOut=true;
      clearTabState();
      try{if(activityKey)localStorage.removeItem(activityKey)}catch{}
      location.replace("../");
    }
    return;
  }
  if(event==="SIGNED_IN"){
    let hasLoginMarker=false;
    try{hasLoginMarker=Boolean(sessionStorage.getItem(TAB_MARKER))}catch{}
    if(!hasLoginMarker){
      if(!hasActivePortalPeer(route,tabId)){void finishLogout("browser-closed");return}
      tabId=registerPortalTab(route,{updateMarker:true})||tabId;
    }else{
      tabId=registerPortalTab(route,{updateMarker:false})||tabId;
    }
    if(!loggedOut){
      clearLifecycleMarkers();startHeartbeat();
      lastActivity=Date.now();setActivity(lastActivity);
      injectTimer();schedule();
    }
    return;
  }
  if(!loggedOut&&!lastActivity){
    const stored=Number(sessionStorage.getItem(LAST_ACTIVITY)||0);
    let shared=0;
    try{shared=Number(localStorage.getItem(activityKey)||0)}catch{}
    lastActivity=Math.max(stored,Number.isFinite(shared)?shared:0)||Date.now();
    if(!stored&&!shared)setActivity(lastActivity);
    injectTimer();schedule();
  }
});
void init();
