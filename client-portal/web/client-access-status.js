import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

const db=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
let refreshInFlight=null;
let lastRefreshAt=0;
let networkBlockedUntil=0;
let observerTimer=null;

const NETWORK_COOLDOWN_MS=15000;
const REFRESH_COOLDOWN_MS=1500;

function hasClientRows(){
  return Boolean(document.querySelector(".portal-main #client-rows"));
}

function scheduleRefresh(delay=250){
  if(observerTimer)clearTimeout(observerTimer);
  observerTimer=setTimeout(()=>{
    observerTimer=null;
    void refresh();
  },delay);
}

async function refresh(){
  if(!hasClientRows())return;
  if(!navigator.onLine)return;
  const now=Date.now();
  if(now<networkBlockedUntil)return;
  if(refreshInFlight)return refreshInFlight;
  if(now-lastRefreshAt<REFRESH_COOLDOWN_MS)return;
  lastRefreshAt=now;

  refreshInFlight=(async()=>{
    const {data:{session}}=await db.auth.getSession();
    if(!session?.access_token)return;

    const h={
      Authorization:`Bearer ${session.access_token}`,
      "Content-Type":"application/json"
    };

    try{
      // This synchronization is only needed when the Clients view is actually
      // loaded. The old MutationObserver called it for every DOM change,
      // including the DOM changes made by this function itself.
      const syncResponse=await fetch(
        `${SUPABASE_URL}/functions/v1/sync-approved-portal-clients`,
        {method:"POST",headers:h}
      );
      if(!syncResponse.ok){
        console.warn("KKA client access sync returned",syncResponse.status);
      }

      const statusResponse=await fetch(
        `${SUPABASE_URL}/functions/v1/admin-client-access-status`,
        {method:"POST",headers:h}
      );
      if(!statusResponse.ok)return;

      const statusPayload=await statusResponse.json().catch(()=>({}));

      const {data:activeRows,error:activeError}=await db
        .from("clients")
        .select("id,active");

      if(activeError){
        console.warn("KKA client active-state lookup failed",activeError);
      }

      const activeMap=new Map(
        (activeRows??[]).map(c=>[String(c.id),c.active===true])
      );
      const statusMap=new Map(
        (statusPayload.clients??[]).map(c=>[String(c.id),c])
      );

      const main=document.querySelector(".portal-main");
      if(!main?.querySelector("#client-rows"))return;

      main.querySelectorAll("[data-manage]").forEach(btn=>{
        const row=btn.closest("tr");
        const client=statusMap.get(btn.dataset.manage);
        if(!row||!client)return;

        const cell=row.children[3];
        if(!cell)return;

        const clientActive=activeMap.has(String(client.id))
          ? activeMap.get(String(client.id))===true
          : true;
        const hasLogin=client.enabled===true;
        const isFamilyProfile=clientActive&&client.enabled!==true;
        const enabled=hasLogin&&clientActive;

        cell.innerHTML=
          `<span class="pill ${enabled?"success":"neutral"}">${enabled?"Enabled":isFamilyProfile?"Family":"Disabled"}</span>`;
      });
    }catch(error){
      // Network failures must never block the Clients page. Also prevent the
      // MutationObserver from immediately hammering Supabase again.
      if(error instanceof TypeError||/failed to fetch|networkerror|load failed/i.test(String(error?.message||error))){
        networkBlockedUntil=Date.now()+NETWORK_COOLDOWN_MS;
        console.warn("KKA client access status temporarily unavailable:",error);
      }else{
        console.error("KKA client access status failed:",error);
      }
    }finally{
      refreshInFlight=null;
    }
  })();

  return refreshInFlight;
}

const observer=new MutationObserver(()=>{
  if(hasClientRows())scheduleRefresh();
});
observer.observe(document.body,{childList:true,subtree:true});

window.addEventListener("online",()=>scheduleRefresh(0));
void refresh();
