const SUPABASE_URL="https://wvyjyncgxtstyquecfdg.supabase.co";
const SUPABASE_PUBLISHABLE_KEY="sb_publishable_bz_IaZtgADuIBvBca25h7g_G0xLb_T3";
const ENDPOINT=`${SUPABASE_URL}/functions/v1/system-log`;
const requestId=crypto.randomUUID();
const started=performance.now();

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
function send(level,operation,message,details={},extra={}){
  try{
    const body={
      level,source:"portal-client",operation,message,request_id:requestId,
      page:location.pathname,path:location.href.split("?")[0],
      user_agent:navigator.userAgent,
      details:clean(details),...extra
    };
    fetch(ENDPOINT,{method:"POST",keepalive:true,headers:{"Content-Type":"application/json","apikey":SUPABASE_PUBLISHABLE_KEY},body:JSON.stringify(body)}).catch(()=>{});
  }catch{}
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
  const startedAt=performance.now();
  let response;
  try{
    response=await originalFetch(...args);
  }catch(error){
    send("error","network_error",error?.message||"Network request failed",{url:String(args[0]||"")});
    throw error;
  }
  const url=typeof args[0]==="string"?args[0]:args[0]?.url||"";
  if(!url.includes("/functions/v1/system-log") && !response.ok){
    let message=`HTTP ${response.status}`;
    try{
      const clone=response.clone();
      const data=await clone.json();
      message=data?.error||data?.message||message;
    }catch{}
    send("error","api_error",message,{url:url.split("?")[0],method:args[1]?.method||"GET",http_status:response.status},{
      http_status:response.status,duration_ms:Math.round(performance.now()-startedAt)
    });
  }
  return response;
};
