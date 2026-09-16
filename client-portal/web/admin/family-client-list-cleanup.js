import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "../config.js";

const supabase=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
let familyMemberIds=new Set();

async function loadFamilyMemberIds(){
  const {data,error}=await supabase.from("client_account_members").select("client_id,is_primary,active").eq("active",true).eq("is_primary",false);
  if(error){console.warn("KKA family list cleanup could not load family members",error);return false}
  familyMemberIds=new Set((data||[]).map(x=>x.client_id).filter(Boolean));
  cleanRows();
  return true;
}

function cleanRows(){
  const tbody=document.querySelector("#client-rows");
  if(!tbody)return;
  tbody.querySelectorAll("tr").forEach(row=>{
    if(row.classList.contains("family-profile-child-row"))return;
    const manage=row.querySelector("[data-manage]");
    const id=manage?.dataset.manage;
    if(id&&familyMemberIds.has(id))row.remove();
  });
}

const observer=new MutationObserver(cleanRows);
observer.observe(document.body,{childList:true,subtree:true});
loadFamilyMemberIds();
