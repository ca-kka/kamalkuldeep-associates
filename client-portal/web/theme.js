const STORAGE_KEY="kka-theme";
const root=document.documentElement;

function preferredTheme(){
  const saved=localStorage.getItem(STORAGE_KEY);
  if(saved==="dark"||saved==="light")return saved;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches?"dark":"light";
}
function apply(theme){
  root.dataset.theme=theme;
  localStorage.setItem(STORAGE_KEY,theme);
  const button=document.querySelector("#theme-toggle");
  if(button){button.textContent=theme==="dark"?"☀ Light":"☾ Dark";button.setAttribute("aria-label",theme==="dark"?"Switch to light mode":"Switch to dark mode");button.title=theme==="dark"?"Switch to light mode":"Switch to dark mode"}
}

const style=document.createElement("style");
style.textContent=`
:root[data-theme="dark"]{--ink:#e8eee9;--forest:#183a31;--forest-2:#245246;--paper:#101714;--line:#304039;--muted:#a8b7af;--white:#18211d;--soft:#202c27;--warning:#e3b05b;--success:#65c48d;--shadow:0 8px 24px rgba(0,0,0,.28)}
:root[data-theme="dark"] body{background:var(--paper);color:var(--ink)}
:root[data-theme="dark"] .portal-main h1,:root[data-theme="dark"] .portal-main h2,:root[data-theme="dark"] .stats strong{color:var(--ink)}
:root[data-theme="dark"] .eyebrow{color:#9db0a6}
:root[data-theme="dark"] .sidebar{background:#122c25}
:root[data-theme="dark"] .desktop-note{background:#1d4137;border-color:#365c50}
:root[data-theme="dark"] .user,:root[data-theme="dark"] .secondary,:root[data-theme="dark"] .row button{background:#1b2521;color:var(--ink);border-color:var(--line)}
:root[data-theme="dark"] .primary{background:#2d6958}
:root[data-theme="dark"] .primary:hover{background:#397764}
:root[data-theme="dark"] .secondary:hover,:root[data-theme="dark"] .row button:hover{background:var(--soft)}
:root[data-theme="dark"] .success{color:#8ee0ac;background:#183b2b}
:root[data-theme="dark"] .neutral{color:#bdc9c2;background:#29332f}
:root[data-theme="dark"] td{border-bottom-color:#26332d}
:root[data-theme="dark"] .form-grid input,:root[data-theme="dark"] select,:root[data-theme="dark"] textarea{background:#131c18!important;color:var(--ink)!important;border-color:var(--line)!important}
:root[data-theme="dark"] .profile-dropdown{background:#18211d;border-color:var(--line)}
:root[data-theme="dark"] .profile-dropdown button{color:var(--ink)}
:root[data-theme="dark"] .profile-dropdown button:hover{background:var(--soft);color:#d8eee1}
:root[data-theme="dark"] .profile-divider{background:var(--line)}
:root[data-theme="dark"] .profile-card,:root[data-theme="dark"] .profile-details div,:root[data-theme="dark"] .manage-status{background:var(--soft);border-color:var(--line)}
:root[data-theme="dark"] .modal{background:#18211d;border-color:var(--line)}
:root[data-theme="dark"] .modal-backdrop{background:rgba(0,0,0,.62)}
:root[data-theme="dark"] .danger{background:#301c19;border-color:#71433b;color:#f0a99d}
:root[data-theme="dark"] .danger-warning{background:#301c19;border-color:#71433b;color:#f0b2a7}
:root[data-theme="dark"] .manual-summary,:root[data-theme="dark"] .uploader-summary{background:var(--soft);border-color:var(--line)}
:root[data-theme="dark"] .drop-zone{background:#151e1a;border-color:#415249}
:root[data-theme="dark"] .drop-zone.dragover{background:#1d3029}
#theme-toggle{position:fixed;right:18px;bottom:18px;z-index:1000;border:1px solid var(--line);background:var(--white);color:var(--ink);border-radius:999px;padding:9px 13px;font:700 12px Inter,ui-sans-serif,system-ui,sans-serif;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.12)}
#theme-toggle:hover{background:var(--soft)}
@media(max-width:700px){#theme-toggle{right:12px;bottom:12px}}
`;
document.head.appendChild(style);

apply(preferredTheme());
const button=document.createElement("button");
button.id="theme-toggle";
button.type="button";
button.addEventListener("click",()=>apply(root.dataset.theme==="dark"?"light":"dark"));
document.body.appendChild(button);
apply(root.dataset.theme);
