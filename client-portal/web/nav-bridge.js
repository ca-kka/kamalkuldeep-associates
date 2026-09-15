import "./access-requests.js?v=20260914-1";

// Keep the established portal view modules in control of their dedicated routes.
// This bridge only prevents the legacy bubble navigation handler from overriding
// views that already have dedicated route modules. Documents is intentionally
// excluded because documents-browser.js owns that route.
const handledViews=new Set(["review","activity","staff-access","access-requests"]);
document.addEventListener("click",event=>{
  const link=event.target.closest?.("a[data-view]");
  if(!link)return;
  const view=link.dataset.view;
  if(handledViews.has(view))event.stopImmediatePropagation();
},true);

// Small, unobtrusive home icon for the Overview destination.
function addHomeIcon(){
  if(document.getElementById("kka-home-icon-style"))return;
  const style=document.createElement("style");
  style.id="kka-home-icon-style";
  style.textContent=`.sidebar nav a[data-view="dashboard"]{display:flex;align-items:center;gap:8px}.sidebar nav a[data-view="dashboard"]::before{content:"";width:13px;height:13px;display:inline-block;flex:0 0 13px;background:currentColor;clip-path:polygon(50% 5%,95% 43%,84% 43%,84% 95%,60% 95%,60% 64%,40% 64%,40% 95%,16% 95%,16% 43%,5% 43%);opacity:.82}`;
  document.head.appendChild(style);
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",addHomeIcon,{once:true});else addHomeIcon();
