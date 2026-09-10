import { createClient as createSupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";
const supabase=createSupabaseClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
const PAN_TYPES={P:"Individual",C:"Company",F:"Firm / LLP",H:"HUF",A:"Association of Persons (AOP)",B:"Body of Individuals (BOI)",T:"Trust",G:"Government",L:"Local Authority",J:"Artificial Juridical Person"};
const panType=pan=>{const p=String(pan??"").toUpperCase().trim();return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(p)?(PAN_TYPES[p[3]]??"Other / Unknown"):"PAN not available / invalid"};
const isCompany=c=>panType(c?.pan)==="Company"&&!!c?.cin;
const esc=v=>String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
let clients=[];
async function loadClients(){const {data,error}=await supabase.from("clients").select("id,pan,cin").eq("active",true);if(!error)clients=data||[];applyPanRules()}
function applyPanRules(){const select=document.querySelector("#manual-client"),area=document.querySelector("#manual-area");if(!select||!area)return;const client=clients.find(c=>c.id===select.value),type=panType(client?.pan),mca=[...area.options].find(o=>o.value==="mca");if(mca)mca.hidden=!isCompany(client);if(area.value==="mca"&&!isCompany(client)){area.value="";area.dispatchEvent(new Event("change"))}let badge=document.querySelector("#manual-assessee-type");if(!badge){badge=document.createElement("div");badge.id="manual-assessee-type";badge.className="manual-summary";area.closest(".manual-grid")?.insertAdjacentElement("afterend",badge)}badge.innerHTML=client?`<strong>Assessee type:</strong> ${esc(type)}${client.pan?` · PAN 4th character: ${esc(String(client.pan).charAt(3).toUpperCase())}`:""}${client.cin?" · CIN present":""}`:"<span class=\"muted\">Assessee type will be identified from the PAN.</span>"}
function hook(){const select=document.querySelector("#manual-client");if(!select)return;if(!select.dataset.panHooked){select.dataset.panHooked="1";select.addEventListener("change",()=>setTimeout(applyPanRules,0))}applyPanRules()}
const style=document.createElement("style");style.textContent="#manual-assessee-type{grid-column:1/-1;margin-top:-6px}.manual-grid #manual-area option[value=\"mca\"][hidden]{display:none!important}";document.head.appendChild(style);
new MutationObserver(hook).observe(document.body,{childList:true,subtree:true});
loadClients();
