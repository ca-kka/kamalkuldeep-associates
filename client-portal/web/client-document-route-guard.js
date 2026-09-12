document.addEventListener("click",e=>{const link=e.target.closest?.('a[data-view="documents"]');if(!link||window.KKAClientSession!==true)return;e.preventDefault();e.stopImmediatePropagation()},true);
