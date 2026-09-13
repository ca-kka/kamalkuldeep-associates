const STORAGE_KEY="kka-theme";
const root=document.documentElement;
function preferredTheme(){const saved=localStorage.getItem(STORAGE_KEY);if(saved==="dark"||saved==="light")return saved;return window.matchMedia?.("(prefers-color-scheme: dark)").matches?"dark":"light";}
function apply(theme){root.dataset.theme=theme;root.style.colorScheme=theme;localStorage.setItem(STORAGE_KEY,theme);const button=document.querySelector("#theme-toggle");if(button){button.textContent=theme==="dark"?"☀ Light":"☾ Dark";button.setAttribute("aria-label",theme==="dark"?"Switch to light mode":"Switch to dark mode");button.title=theme==="dark"?"Switch to light mode":"Switch to dark mode"}}
apply(preferredTheme());
const button=document.createElement("button");button.id="theme-toggle";button.type="button";button.addEventListener("click",()=>apply(root.dataset.theme==="dark"?"light":"dark"));document.body.appendChild(button);apply(root.dataset.theme);