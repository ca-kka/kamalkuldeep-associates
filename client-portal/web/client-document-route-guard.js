// Client document route guard

document.addEventListener("click",e=>{const link=e.target.closest?.('a[data-view="documents"]');if(!link)return;if(!localStorage.getItem("kka-selected-client"))return;e.preventDefault();e.stopImmediatePropagation();},true);
