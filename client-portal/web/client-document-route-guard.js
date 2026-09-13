// Client document routing is handled by family-documents-view.js.
// Keep the staff-only document uploader from intercepting the client Documents tab.
document.addEventListener("click",e=>{
  const link=e.target.closest?.('a[data-view="documents"]');
  if(!link)return;
  if(localStorage.getItem("kka-selected-client")){
    e.preventDefault();
    e.stopImmediatePropagation();
  }
},true);
