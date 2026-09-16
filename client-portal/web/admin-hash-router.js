/* Admin deep-link router. app.js renders the shell first; this then honors
   /admin/#<view> so direct links open the requested Admin screen. */
const ROUTES=new Set(["overview","documents","clients","storage","review","activity","staff-access","access-requests","filing-structure"]);

function routeFromHash(){
  const view=(location.hash||"#overview").slice(1).split("?")[0].trim().toLowerCase()||"overview";
  if(!ROUTES.has(view))return;
  const link=document.querySelector(`.sidebar a[data-view="${CSS.escape(view==="overview"?"dashboard":view)}"]`);
  if(!link)return;
  if(view==="overview"){
    if(typeof link.click==="function")link.click();
    return;
  }
  link.click();
}

let attempts=0;
const boot=()=>{
  if(document.querySelector(".portal-shell")){routeFromHash();return}
  if(++attempts<120)setTimeout(boot,50);
};
boot();
window.addEventListener("hashchange",routeFromHash);
