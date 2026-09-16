const LEGACY_KEY="kka-selected-client";
const USER_KEY_PREFIX="kka-selected-client:";

function userKey(userId){return `${USER_KEY_PREFIX}${userId}`}
function syncSelect(select){
  const id=select?.value;
  if(!id)return;
  localStorage.setItem(LEGACY_KEY,id);
  window.dispatchEvent(new CustomEvent("kka-family-profile-change",{detail:{clientId:id}}));
}

function install(){
  const select=document.querySelector("#client-profile-select");
  if(select&&!select.dataset.profileSync){
    select.dataset.profileSync="1";
    syncSelect(select);
    select.addEventListener("change",()=>syncSelect(select));
  }
}

install();
new MutationObserver(install).observe(document.body,{childList:true,subtree:true});

window.addEventListener("storage",e=>{
  if(e.key===LEGACY_KEY&&e.newValue){
    const select=document.querySelector("#client-profile-select");
    if(select&&select.value!==e.newValue){select.value=e.newValue;select.dispatchEvent(new Event("change",{bubbles:true}))}
  }
});
