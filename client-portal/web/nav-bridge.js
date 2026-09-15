import "./access-requests.js?v=20260914-1";
// Keep the legacy app navigation handler from overriding dedicated portal views.
// Dedicated view modules register document-level capture handlers; this runs last and
// stops the legacy bubble handler after the appropriate view module has handled it.
// Documents is intentionally excluded: documents-browser.js is the dedicated handler
// for both admin/staff and client document navigation and must receive the click first.
const handledViews=new Set(["review","activity","staff-access","access-requests"]);
document.addEventListener("click",event=>{
  const link=event.target.closest?.("a[data-view]");
  if(!link)return;
  const view=link.dataset.view;
  if(handledViews.has(view))event.stopImmediatePropagation();
},true);
