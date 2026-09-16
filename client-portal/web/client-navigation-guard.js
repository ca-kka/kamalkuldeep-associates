/* Client portal: dedicated Client view modules own non-dashboard navigation. */
const dedicatedViews=new Set(["documents","upload"]);
document.addEventListener("click",event=>{
  const link=event.target.closest?.("a[data-view]");
  if(!link||!dedicatedViews.has(link.dataset.view))return;
  event.stopImmediatePropagation();
},true);
