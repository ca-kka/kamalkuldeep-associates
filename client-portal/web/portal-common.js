/* KKA shared portal shell: common legal navigation, shell polish and safe account affordances. */
const LEGAL_LINKS=[
  ["Privacy","../privacy.html"],
  ["Security","../security.html"],
  ["Terms","../terms.html"]
];

function ensureLegalFooter(){
  const shell=document.querySelector(".portal-shell");
  const sidebar=shell?.querySelector(".sidebar");
  if(!sidebar)return;

  let footer=sidebar.querySelector(".legal-footer");
  if(!footer){
    footer=document.createElement("nav");
    footer.className="legal-footer";
    footer.setAttribute("aria-label","Legal information");
    sidebar.appendChild(footer);
  }

  footer.replaceChildren(...LEGAL_LINKS.map(([label,href])=>{
    const a=document.createElement("a");
    a.href=href;
    a.textContent=label;
    return a;
  }));

  // Keep legal links reachable at the bottom of either role's sidebar.
  sidebar.appendChild(footer);
}

function installCommonShellStyle(){
  if(document.getElementById("kka-common-portal-style"))return;
  const style=document.createElement("style");
  style.id="kka-common-portal-style";
  style.textContent=`
    .sidebar>.legal-footer{
      margin-top:auto!important;
      padding:14px 12px 0;
      border-top:1px solid rgba(255,255,255,.16);
      gap:14px;
      flex:0 0 auto;
    }
    .sidebar>.legal-footer a{
      color:#cce0d4;
      text-decoration:none;
      font-size:12px;
      font-weight:650;
      padding:3px 0;
    }
    .sidebar>.legal-footer a:hover{color:#fff;text-decoration:underline;text-underline-offset:3px}
    @media(max-width:760px){
      .sidebar>.legal-footer{margin-top:auto!important;padding-top:14px}
    }
  `;
  document.head.appendChild(style);
}

function markShell(){
  document.documentElement.dataset.kkaPortalShell="ready";
}

function init(){
  installCommonShellStyle();
  const observer=new MutationObserver(()=>{
    const shell=document.querySelector(".portal-shell");
    if(!shell)return;
    ensureLegalFooter();
    markShell();
    observer.disconnect();
  });
  observer.observe(document.getElementById("app")||document.body,{childList:true,subtree:true});
  if(document.querySelector(".portal-shell")){
    ensureLegalFooter();
    markShell();
    observer.disconnect();
  }
}

init();
window.KKACommonPortal={ensureLegalFooter};
