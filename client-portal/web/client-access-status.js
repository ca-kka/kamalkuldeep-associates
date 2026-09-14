import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";
const db=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
async function refresh(){
  const main=document.querySelector(".portal-main");
  if(!main?.querySelector("#client-rows"))return;
  const {data:{session}}=await db.auth.getSession();
  if(!session?.access_token)return;
  const h={Authorization:`Bearer ${session.access_token}`,"Content-Type":"application/json"};
  await fetch(`${SUPABASE_URL}/functions/v1/sync-approved-portal-clients`,{method:"POST",headers:h}).catch(()=>{});
  const r=await fetch(`${SUPABASE_URL}/functions/v1/admin-client-access-status`,{method:"POST",headers:h}).catch(()=>null);
  if(!r?.ok)return;
  const x=await r.json().catch(()=>({}));
  const {data:activeRows}=await db.from("clients").select("id,active");
  const activeMap=new Map((activeRows??[]).map(c=>[String(c.id),c.active===true]));
  const map=new Map((x.clients??[]).map(c=>[String(c.id),c]));
  main.querySelectorAll("[data-manage]").forEach(btn=>{
    const row=btn.closest("tr");
    const c=map.get(btn.dataset.manage);
    if(!row||!c)return;
    const cell=row.children[3];
    if(!cell)return;
    const clientActive=activeMap.has(String(c.id))?activeMap.get(String(c.id))===true:true;
    const enabled=c.enabled===true&&clientActive;
    cell.innerHTML=`<span class="pill ${enabled?"success":"neutral"}">${enabled?"Enabled":"Disabled"}</span>`;
  });
}
const observer=new MutationObserver(()=>{if(document.querySelector("#client-rows"))void refresh()});
observer.observe(document.body,{childList:true,subtree:true});
void refresh();