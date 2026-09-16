/* Client portal: dedicated view modules own non-dashboard navigation. */
document.addEventListener("click",event=>{
  const link=event.target.closest?.('a[data-view="documents"]');
  if(!link)return;
  event.stopImmediatePropagation();
},true);
