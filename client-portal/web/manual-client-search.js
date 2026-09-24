import { createClient as createSupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

const supabase=createSupabaseClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
const esc=v=>String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
const norm=v=>String(v??"").toLowerCase().trim();
const compact=v=>norm(v).replace(/[^a-z0-9]/g,"");
let clients=null,loading=null;

async function loadClients(force=false){
  if(force)clients=null;
  if(clients)return clients;
  if(loading)return loading;
  loading=supabase.from("clients").select("id,legal_name,display_name,pan,tan,cin,gstin").eq("active",true).order("legal_name",{ascending:true})
    .then(({data,error})=>{if(error)throw error;clients=data||[];return clients}).finally(()=>{loading=null});
  return loading;
}
function nameOf(c){return c.display_name||c.legal_name||"Unnamed client"}
function ids(c){return [c.pan&&("PAN "+c.pan),c.gstin&&("GSTIN "+c.gstin),c.tan&&("TAN "+c.tan),c.cin&&("CIN "+c.cin)].filter(Boolean)}
function initials(c){return nameOf(c).split(/\s+/).filter(Boolean).map(w=>w[0]).join("")}
function matches(c,q){
  const n=norm(q),p=compact(q);
  if(!n)return true;
  const values=[c.display_name,c.legal_name,c.pan,c.tan,c.cin,c.gstin];
  return values.some(v=>v&&norm(v).includes(n))||initials(c).toLowerCase().startsWith(p);
}
function install(select){
  if(!select||select.dataset.clientSearchReady==="1")return;
  const label=select.closest("label");if(!label)return;
  select.dataset.clientSearchReady="1";
  const wrap=document.createElement("div");wrap.className="manual-client-wrap";
  const input=document.createElement("input");input.className="manual-client-search-input";input.type="search";input.autocomplete="off";input.placeholder="Search client by name or initials…";
  const results=document.createElement("div");results.className="manual-client-results";results.hidden=true;
  const selected=document.createElement("div");selected.className="manual-client-selected";selected.setAttribute("aria-live","polite");
  wrap.append(input,results,selected);select.hidden=true;label.append(wrap);
  const selectedCard=()=>{
    const c=clients?.find(x=>x.id===select.value);
    selected.innerHTML=c?'<div class="manual-client-selected-card"><strong>'+esc(nameOf(c))+'</strong><span>'+esc(ids(c).join(" · "))+'</span><button type="button" class="manual-client-clear">Change</button></div>':"";
    selected.querySelector(".manual-client-clear")?.addEventListener("click",()=>{
      select.value="";select.dispatchEvent(new Event("change",{bubbles:true}));input.value="";selected.innerHTML="";input.focus();draw();
    });
  };
  const draw=()=>{
    const q=input.value.trim();
    if(select.value&&selected.innerHTML){results.hidden=true;return}
    const list=clients||[],found=list.filter(c=>matches(c,q)).slice(0,25);
    if(!q){results.innerHTML="";results.hidden=true;return}
    results.innerHTML=found.length?found.map(c=>'<button type="button" class="manual-client-result" data-id="'+esc(c.id)+'"><strong>'+esc(nameOf(c))+'</strong><span>'+esc(ids(c).join(" · ")||"")+'</span></button>').join(""):'<div class="manual-client-note">No active client matched “'+esc(q)+'”.</div>';
    results.hidden=false;
  };
  input.addEventListener("input",draw);
  input.addEventListener("focus",async()=>{try{await loadClients();draw()}catch{results.innerHTML='<div class="manual-client-note">Client search is temporarily unavailable. Refresh and try again.</div>';results.hidden=false}});
  results.addEventListener("click",e=>{
    const b=e.target.closest("[data-id]");if(!b)return;
    const c=(clients||[]).find(x=>x.id===b.dataset.id);if(!c)return;
    select.value=c.id;select.dispatchEvent(new Event("change",{bubbles:true}));input.value=nameOf(c);results.hidden=true;selectedCard();
  });
  select.addEventListener("change",async()=>{if(!clients)try{await loadClients()}catch{};if(select.value){const c=clients?.find(x=>x.id===select.value);if(c){input.value=nameOf(c);selectedCard();}}else{input.value="";selected.innerHTML="";results.hidden=true;}});
  loadClients().then(()=>{if(select.value)selectedCard()}).catch(()=>{});
}
function init(){const select=document.querySelector("#manual-client");if(select)install(select)}
const observer=new MutationObserver(init);
observer.observe(document.body,{childList:true,subtree:true});
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
window.addEventListener("kka-client-list-refresh",()=>{clients=null;init()});
