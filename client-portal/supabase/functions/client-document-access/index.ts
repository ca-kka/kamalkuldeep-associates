import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("PORTAL_ALLOWED_ORIGIN") ?? "https://portal.ca-kka.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,"Content-Type":"application/json","Cache-Control":"no-store"}});

async function auth(req:Request){
  const token=req.headers.get("Authorization")?.replace(/^Bearer\s+/i,"");
  if(!token)throw new Error("Missing client session");
  const url=Deno.env.get("SUPABASE_URL")!;
  const anon=createClient(url,Deno.env.get("SUPABASE_ANON_KEY")!,{auth:{autoRefreshToken:false,persistSession:false}});
  const {data:{user},error}=await anon.auth.getUser(token);
  if(error||!user)throw new Error("Invalid or expired client session");
  const service=createClient(url,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{autoRefreshToken:false,persistSession:false}});
  const {data:profile,error:profileError}=await service.from("profiles").select("role,active").eq("id",user.id).maybeSingle();
  if(profileError)throw profileError;
  if(!profile?.active)throw new Error("Account inactive");
  const caller=createClient(url,Deno.env.get("SUPABASE_ANON_KEY")!,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{autoRefreshToken:false,persistSession:false}});
  return {user,service,profile,caller};
}

Deno.serve(async req=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
  if(req.method!=="POST")return json({error:"POST requests only."},405);
  try{
    const {service,profile,caller}=await auth(req);
    const {documentId,action="view"}=await req.json();
    if(!documentId)return json({error:"documentId is required"},400);
    const {data:doc,error}=await service.from("documents").select("id,client_id,storage_path,original_filename,content_type,status,deleted_at").eq("id",documentId).maybeSingle();
    if(error)throw error;
    if(!doc)return json({error:"Document not found"},404);
    if(doc.status!=="accepted"||doc.deleted_at)return json({error:"Document is no longer available"},403);
    const {data:entitled,error:entitlementError}=await caller.from("documents").select("id").eq("id",doc.id).maybeSingle();
    if(entitlementError)throw entitlementError;
    if(!entitled)return json({error:"Document access denied"},403);
    const {data:signed,error:signError}=await service.storage.from("client-documents").createSignedUrl(doc.storage_path,1800,{download:action==="download"?doc.original_filename:false});
    if(signError||!signed?.signedUrl)throw signError??new Error("Could not create secure document link");
    return json({success:true,url:signed.signedUrl,expiresIn:1800,filename:doc.original_filename,contentType:doc.content_type});
  }catch(e){
    const message=e instanceof Error?e.message:"Document access failed";
    return json({error:message},/session|access|membership|inactive/i.test(message)?403:400);
  }
});
