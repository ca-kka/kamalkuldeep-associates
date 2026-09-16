import "./access-requests.js?v=20260914-1";

/* Admin-only compatibility guard. Dedicated Admin view modules own every non-dashboard route. */
const dedicatedViews=new Set(["documents","clients","storage","review","activity","staff-access","access-requests","filing-structure"]);

document.addEventListener("click",event=>{
  const link=event.target.closest?.("a[data-view]");
  if(!link)return;
  const view=link.dataset.view;
  if(dedicatedViews.has(view))event.stopImmediatePropagation();
},true);
