import {createClient} from "https://esm.sh/@supabase/supabase-js@2";
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from "./config.js";

const ENDPOINT=`${SUPABASE_URL}/functions/v1/system-log`;
const supabase=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{autoRefreshToken:false,persistSession:true,detectSessionInUrl:false}});
const requestId=crypto.randomUUID();
const started=performance.now();

const ERROR_CODE_BY_OPERATION={javascript_error:"KKA-SYS-0001",unhandled_rejection:"KKA-SYS-0001",network_error:"KKA-SYS-0002",api_error:"KKA-SYS-0001"};
const inferServerCode=(data,status)=>{
  if(data?.error_code)return String(data.error_code);
  if(status===401||status===403)return "KKA-SEC-0001";
  if(status>=500)return "KKA-SYS-0001";
  return null;
};
const severityFor=(code,level="error")=>{
  if(code==="KKA-SEC-0001"||code==="KKA-SEC-0002")return "critical";
  if(code==="KKA-SYS-0001"||code==="KKA-SYS-0002")return level==="error"?"high":"medium";
  return level==="error"?"medium":"low";
};

let cachedSession=null;
let sessionCheckedAt=0;

function clean(value,depth=0){
  if(depth>3)return "[truncated]";
  if(Array.isArray(value))return value.slice(0,20).map(v=>clean(v,depth+1));
  if(value&&typeof value==="object"){
    const out={};
    for(const [k,v] of Object.entries(value)){
      if(/password|otp|token|secret|authorization|apikey|credential|cookie/i.test(k))out[k]="[redacted]";
      else out[k]=clean(v,depth+1);
    }
    return out;
  }
  if(typeof value==="string")return value.length>1000?value.slice(0,1000)+"…":value;
  return value;
}

async function getCurrentSession(){
  const now=Date.now();
  if(now-sessionCheckedAt<1000)return cachedSession;
  sessionCheckedAt=now;
  try{
    const {data:{session}}=await supabase.auth.getSession();
    cachedSession=session||null;
    return cachedSession;
  }catch{
    cachedSession=null;
    return null;
  }
}

function send(level,operation,message,details={},extra={}){
  Promise.resolve().then(async()=>{
    try{
      const session=await getCurrentSession();
      const body={
        level,source:"portal-client",operation,message,request_id:requestId,
        page:location.pathname,path:location.href.split("?")[0],
        user_agent:navigator.userAgent,
        error_code:extra.error_code||ERROR_CODE_BY_OPERATION[operation]||null,
        severity:extra.severity||severityFor(extra.error_code||ERROR_CODE_BY_OPERATION[operation],level),
        details:clean(details),
        ...extra
      };
      const headers={"Content-Type":"application/json","apikey":SUPABASE_PUBLISHABLE_KEY};
      if(session?.access_token)headers.Authorization=`Bearer ${session.access_token}`;
      await fetch(ENDPOINT,{method:"POST",keepalive:true,headers,body:JSON.stringify(body)}).catch(()=>{});
    }catch{}
  });
}

window.KKALog={
  info:(operation,message,details)=>send("info",operation,message,details),
  warn:(operation,message,details)=>send("warn",operation,message,details),
  error:(operation,message,details)=>send("error",operation,message,details),
  requestId
};

send("info","page_load","Diagnostic logging initialized",{load_ms:Math.round(performance.now()-started)});

document.addEventListener("click",event=>{
  const target=event.target.closest?.("button,a,[role=button],[data-action]");
  if(!target)return;
  const label=(target.getAttribute("aria-label")||target.textContent||target.dataset.action||"").replace(/\s+/g," ").trim().slice(0,200);
  if(!label)return;
  send("info","ui_click",label,{
    tag:target.tagName.toLowerCase(),
    id:target.id||null,
    view:target.dataset.view||null,
    href:target.getAttribute("href")||null
  });
},true);

window.addEventListener("error",event=>{
  send("error","javascript_error",event.message||"Unhandled browser error",{filename:event.filename||null,line:event.lineno||null,column:event.colno||null});
});
window.addEventListener("unhandledrejection",event=>{
  const reason=event.reason;
  send("error","unhandled_rejection",reason?.message||String(reason||"Unhandled promise rejection"),{name:reason?.name||null});
});

const originalFetch=window.fetch.bind(window);
window.fetch=async(...args)=>{
  const url=typeof args[0]==="string"?args[0]:args[0]?.url||"";
  const startedAt=performance.now();
  let response;
  try{
    response=await originalFetch(...args);
  }catch(error){
    if(!url.includes("/functions/v1/system-log"))send("error","network_error",error?.message||"Network request failed",{url},{error_code:"KKA-SYS-0002"});
    throw error;
  }
  if(!url.includes("/functions/v1/system-log") && !response.ok){
    let message=`HTTP ${response.status}`;
    let extraErrorCode=null;
    let extraReferenceId=null;
    try{
      const clone=response.clone();
      const data=await clone.json();
      message=data?.error||data?.message||message;
      if(data?.error_code){
        extraErrorCode=data.error_code;
        extraReferenceId=data.reference_id||null;
      }
    }catch{}
    send("error","api_error",message,{url:url.split("?")[0],method:args[1]?.method||"GET",http_status:response.status},{
      error_code:extraErrorCode||(response.status===401||response.status===403?"KKA-SEC-0001":response.status>=500?"KKA-SYS-0001":"KKA-SYS-0001"),
      reference_id:extraReferenceId,
      http_status:response.status,duration_ms:Math.round(performance.now()-startedAt)
    });
  }
  return response;
};
