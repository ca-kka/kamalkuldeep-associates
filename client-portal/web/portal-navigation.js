/* KKA Client Portal navigation compatibility module.
 *
 * Navigation ownership remains with the established portal modules. This module
 * intentionally performs no route interception. It only provides the small
 * home affordance beside the KKA mark in the sidebar.
 *
 * Do not add database, storage, OneDrive, authentication, or D.R.I. logic here.
 */
const style=document.createElement("style");
style.textContent=`.sidebar .brand{display:flex;align-items:flex-start;gap:8px}.sidebar .brand-home{width:20px;height:20px;flex:0 0 20px;display:inline-grid;place-items:center;margin-top:7px;border:0;border-radius:6px;color:#d8e9df;text-decoration:none;opacity:.9;transition:background-color .14s ease,color .14s ease,transform .14s ease}.sidebar .brand-home:hover{background:#285b4c;color:#fff;transform:translateY(-1px)}.sidebar .brand-home svg{width:15px;height:15px;display:block}.sidebar .brand-home:focus-visible{outline:2px solid #b9d2c3;outline-offset:2px}.sidebar .brand-mark{min-width:0}`;
document.head.appendChild(style);
function installHome(){
 const brand=document.querySelector(".sidebar .brand");
 if(!brand||brand.querySelector(".brand-home"))return;
 const mark=brand.querySelector("span:first-child");
 if(!mark)return;
 mark.classList.add("brand-mark");
 const home=document.createElement("a");
 home.className="brand-home";
 home.href="#overview";
 home.setAttribute("aria-label","Go to Overview");
 home.title="Home";
 home.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 10.8 12 3.8l8.5 7"/><path d="M5.8 9.7v9.1h12.4V9.7"/><path d="M9.5 18.8v-5.2h5v5.2"/></svg>';
 home.addEventListener("click",event=>{
  event.preventDefault();
  document.querySelector('.sidebar nav a[data-view="dashboard"]')?.click();
 });
 brand.insertBefore(home,mark);
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",installHome,{once:true});else installHome();
export {};