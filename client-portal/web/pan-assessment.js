const PAN_TYPES={P:"Individual",C:"Company",F:"Firm / LLP",H:"HUF",A:"Association of Persons (AOP)",B:"Body of Individuals (BOI)",T:"Trust",G:"Government",L:"Local Authority",J:"Artificial Juridical Person"};
const panType=pan=>{const p=String(pan??"").toUpperCase().trim();return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(p)?(PAN_TYPES[p[3]]??"Other / Unknown"):"PAN not available / invalid"};
const isCompany=c=>panType(c?.pan)==="Company"&&!!c?.cin;
const esc=v=>String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
function applyPanRules(){
  const select=document.querySelector("#manual-client"),area=document.querySelector("#manual-area");
  if(!select||!area)return;
  const options=[...area.options],clients=window.__kkaManualClients||[];
  const client=clients.find(c=>c.id===select.value);
  const type=panType(client?.pan);
  const mca=options.find(o=>o.value==="mca");
  if(mca)mca.hidden=!isCompany(client);
  if(area.value==="mca"&&!isCompany(client)){area.value="";area.dispatchEvent(new Event("change"))}
  let badge=document.querySelector("#manual-assessee-type");
  if(!badge){badge=document.createElement("div");badge.id="manual-assessee-type";badge.className="manual-summary";area.closest(".manual-grid")?.insertAdjacentElement("afterend",badge)}
  badge.innerHTML=client?`<strong>Assessee type:</strong> ${esc(type)}${client.pan?` · PAN 4th character: ${esc(String(client.pan).charAt(3).toUpperCase())}`:""}${client.cin?` · CIN present`:""}`:"<span class=\"muted\">Assessee type will be identified from the PAN.</span>";
}
function hook(){
  const select=document.querySelector("#manual-client");
  if(!select)return;
  const clients=[];
  [...select.options].forEach(o=>{if(o.value){const parts=o.textContent.split(" · CIN ");clients.push({id:o.value,display_name:parts[0],cin:parts[1]||null})}});
  if(!window.__kkaManualClients||window.__kkaManualClients.length===0)window.__kkaManualClients=clients;
  applyPanRules();
  if(!select.dataset.panHooked){select.dataset.panHooked="1";select.addEventListener("change",()=>setTimeout(applyPanRules,0))}
}
const style=document.createElement("style");style.textContent="#manual-assessee-type{grid-column:1/-1;margin-top:-6px}.manual-grid #manual-area option[value=\"mca\"][hidden]{display:none!important}";document.head.appendChild(style);
const observer=new MutationObserver(()=>hook());observer.observe(document.body,{childList:true,subtree:true});
setInterval(hook,1500);
