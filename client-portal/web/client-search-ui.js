import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

const db=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
let clients=[];
const esc=v=>String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));

async function loadClients(){
  if(clients.length)return clients;
  const {data,error}=await db.from("clients").select("id,legal_name,display_name,pan,tan,cin,gstin").eq("active",true).order("legal_name",{ascending:true});
  if(error)throw error;
  clients=data||[];return clients;
}

function enhance(){
  const select=document.querySelector("#manual-client");
  if(!select||select.dataset.clientSearchReady)return;
  select.dataset.clientSearchReady="1";
  const label=select.closest("label");if(!label)return;
  const wrap=document.createElement("div");wrap.className="manual-client-wrap";
  const input=document.createElement("input");input.className="manual-client-search-input";input.type="search";input.placeholder="Search name, PAN, GSTIN, TAN or CIN";input.autocomplete="off";
  const results=document.createElement("div");results.className="manual-client-results";results.hidden=true;
  wrap.append(input,results);select.hidden=true;label.append(wrap);
  const draw=()=>{const q=input.value.trim().toLowerCase();if(!q){results.hidden=true;return}const found=clients.filter(c=>[c.display_name,c.legal_name,c.pan,c.tan,c.cin,c.gstin].some(v=>String(v||"").toLowerCase().includes(q))).slice(0,20);results.innerHTML=found.length?found.map(c=>`<button class="manual-client-result" type="button" data-id="${esc(c.id)}"><strong>${esc(c.display_name||c.legal_name)}</strong><span>${esc([c.pan&&`PAN ${c.pan}`,c.gstin&&`GSTIN ${c.gstin}`,c.cin&&`CIN ${c.cin}`].filter(Boolean).join(" · ")||"No identifier")}</span></button>`).join(""):"<div class=\"muted small\" style=\"padding:11px 12px\">No matching client found.</div>";results.hidden=false};
  input.addEventListener("input",draw);
  results.addEventListener("click",e=>{const b=e.target.closest("[data-id]");if(!b)return;select.value=b.dataset.id;select.dispatchEvent(new Event("change",{bubbles:true}));input.value=b.querySelector("strong")?.textContent||"";results.hidden=true;});
  document.addEventListener("click",e=>{if(!wrap.contains(e.target))results.hidden=true},true);
  loadClients().catch(()=>{});
}

document.addEventListener("click",e=>{if(e.target.closest('a[data-view="documents"]'))setTimeout(enhance,40)},true);
window.addEventListener("load",()=>setTimeout(enhance,80));
