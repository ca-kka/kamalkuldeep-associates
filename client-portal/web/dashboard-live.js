import { createClient as createSupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

const supabase=createSupabaseClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
let timer=null;
let channel=null;
let refreshInFlight=false;

const isStaffRole=role=>["admin","staff"].includes(role);

async function refreshLiveKpis(){
  if(refreshInFlight)return;
  const stats=document.querySelector(".stats");
  if(!stats)return;
  refreshInFlight=true;
  try{
    const {data:{user}}=await supabase.auth.getUser();
    if(!user){stopLiveKpis();return;}
    const {data:profile}=await supabase.from("profiles").select("role,active").eq("id",user.id).maybeSingle();
    if(!profile?.active||!isStaffRole(profile.role)){stopLiveKpis();return;}
    const [documents,review,duplicates,clients]=await Promise.all([
      supabase.from("documents").select("id",{count:"exact",head:true}).eq("status","accepted"),
      supabase.from("documents").select("id",{count:"exact",head:true}).eq("status","review"),
      supabase.from("documents").select("id",{count:"exact",head:true}).eq("status","duplicate"),
      supabase.from("clients").select("id",{count:"exact",head:true}).eq("active",true)
    ]);
    const values=[
      ["Documents",documents.count??0,"Accepted documents in storage"],
      ["Needs review",review.count??0,"Awaiting KKA review"],
      ["Duplicate checks",duplicates.count??0,"Held before storage"],
      ["Active clients",clients.count??0,"Managed securely"]
    ];
    stats.innerHTML=values.map(([label,value,note])=>`<article><p>${label}</p><strong>${value}</strong><span class="muted">${note}</span></article>`).join("");
  }finally{
    refreshInFlight=false;
  }
}

function stopLiveKpis(){
  if(timer){clearInterval(timer);timer=null;}
  if(channel){supabase.removeChannel(channel);channel=null;}
}

async function startLiveKpis(){
  stopLiveKpis();
  await refreshLiveKpis();
  timer=setInterval(refreshLiveKpis,5000);
  channel=supabase.channel("kka-dashboard-live-kpis")
    .on("postgres_changes",{event:"*",schema:"public",table:"documents"},refreshLiveKpis)
    .on("postgres_changes",{event:"*",schema:"public",table:"clients"},refreshLiveKpis)
    .subscribe();
}

supabase.auth.onAuthStateChange((event,session)=>{
  if(session?.user)startLiveKpis().catch(()=>{});
  else stopLiveKpis();
});

document.addEventListener("visibilitychange",()=>{
  if(document.hidden)return;
  if(document.querySelector(".stats"))refreshLiveKpis().catch(()=>{});
});

setTimeout(()=>{if(document.querySelector(".stats"))startLiveKpis().catch(()=>{});},1000);
