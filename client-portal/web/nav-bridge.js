import "./access-requests.js?v=20260914-1";

/* Admin-only compatibility guard.
   app.js still owns the Clients screen, while dedicated modules own the other
   non-dashboard routes. Do not intercept Clients or the shared dashboard. */
const dedicatedViews=new Set(["documents","storage","review","activity","staff-access","access-requests","filing-structure"]);

document.addEventListener("click",event=>{
  const link=event.target.closest?.("a[data-view]");
  if(!link)return;
  const view=link.dataset.view;
  if(dedicatedViews.has(view))event.stopImmediatePropagation();
},true);
