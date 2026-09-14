const STYLE_ID="kka-operation-feedback-style";
const TOAST_ID="kka-operation-feedback";

function install(){
  if(document.getElementById(STYLE_ID))return;
  const s=document.createElement("style");s.id=STYLE_ID;s.textContent=`#${TOAST_ID}{position:fixed;top:18px;right:18px;z-index:10000;width:min(390px,calc(100vw - 36px));padding:13px 15px;border:1px solid var(--line,#dfe5e0);border-radius:11px;background:#fff;box-shadow:0 12px 34px rgba(20,34,29,.13);display:flex;align-items:flex-start;gap:11px;opacity:0;transform:translateY(-8px);pointer-events:none;transition:opacity .18s ease,transform .18s ease;font-size:13px;line-height:1.4}#${TOAST_ID}.show{opacity:1;transform:translateY(0)}#${TOAST_ID}.success{border-color:#b9ddc6;background:#f2faf5}#${TOAST_ID}.error{border-color:#efc1b9;background:#fff6f4}#${TOAST_ID}.info{border-color:#cbd6cf;background:#f7faf8}#${TOAST_ID} .icon{font-weight:800;font-size:15px;line-height:1.2}#${TOAST_ID} .title{display:block;font-weight:800;margin-bottom:2px}#${TOAST_ID} .body{color:var(--muted,#68756f)}#${TOAST_ID} button{margin-left:auto;border:0;background:transparent;color:var(--muted,#68756f);font-size:18px;line-height:1;cursor:pointer;padding:0 2px}`;document.head.appendChild(s);
}

let timer=null;
function notify(message,type="success",detail=""){
  install();
  let el=document.getElementById(TOAST_ID);
  if(!el){el=document.createElement("div");el.id=TOAST_ID;document.body.appendChild(el)}
  clearTimeout(timer);
  const title=type==="error"?"Operation not completed":type==="info"?"Please wait":"Operation completed";
  const icon=type==="error"?"!":type==="info"?"•":"✓";
  el.className=type;
  el.innerHTML=`<span class="icon" aria-hidden="true">${icon}</span><div><span class="title">${title}</span><span class="body"></span></div><button type="button" aria-label="Dismiss">×</button>`;
  el.querySelector(".body").textContent=String(message??"");
  if(detail){el.querySelector(".body").textContent+=` (${detail})`}
  el.querySelector("button").onclick=()=>{el.classList.remove("show")};
  requestAnimationFrame(()=>el.classList.add("show"));
  timer=setTimeout(()=>el.classList.remove("show"),4200);
}

function errorMessage(err){
  if(!err)return "The requested operation could not be completed.";
  const code=err.code||err.status||err.statusCode||err.error_code;
  const text=err.message||err.error||String(err);
  return code?`${text} · Error code: ${code}`:text;
}

window.KKANotify={success:(message,detail="")=>notify(message,"success",detail),error:(err)=>notify(errorMessage(err),"error"),info:(message)=>notify(message,"info"),operation:async(label,fn)=>{notify(`${label}…`,"info");try{const result=await fn();notify(`${label} completed successfully.`);return result}catch(err){notify(errorMessage(err),"error");throw err;}}};

const nativeAlert=window.alert?.bind(window);
window.alert=(message)=>notify(String(message??""),"success");
window.KKANotifyError=errorMessage;
void nativeAlert;
install();