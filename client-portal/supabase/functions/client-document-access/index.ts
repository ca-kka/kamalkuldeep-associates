import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("PORTAL_ALLOWED_ORIGIN") ?? "https://portal.ca-kka.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "Content-Disposition, Content-Type",
};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,"Content-Type":"application/json","Cache-Control":"no-store"}});
function safeFilename(value:unknown){return String(value||"document").replace(/[\u0000-\u001f\u007f\/\\]/g,"_").slice(0,180)||"document"}
function safeContentType(value:unknown){const type=String(value||"").split(";")[0].trim();return /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(type)?type:"application/octet-stream"}
function contentDisposition(value:unknown){
  const name=safeFilename(value);
  const fallback=name.replace(/[^\x20-\x7e]/g,"_").replace(/["\\;]/g,"_");
  const encoded=encodeURIComponent(name).replace(/[!'()*]/g,character=>"%"+character.charCodeAt(0).toString(16).toUpperCase());
  return "attachment; filename=\""+fallback+"\"; filename*=UTF-8''"+encoded;
}
function portalViewerUrl(documentId:string){
  const url=new URL("/document-viewer.html",Deno.env.get("PORTAL_ALLOWED_ORIGIN")??"https://portal.ca-kka.com");
  url.searchParams.set("documentId",documentId);
  url.searchParams.set("v","20261004-portal-doc-host1");
  return url.toString();
}

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
    const {service,caller}=await auth(req);
    const body=await req.json();
    const documentId=typeof body?.documentId==="string"?body.documentId.trim():"";
    const action=body?.action??"view";
    if(!documentId)return json({error:"documentId is required"},400);
    if(!["view","download","download_stream"].includes(action))return json({error:"Unsupported document action"},400);
    const {data:doc,error}=await service.from("documents").select("id,client_id,storage_path,original_filename,content_type,status,deleted_at").eq("id",documentId).maybeSingle();
    if(error)throw error;
    if(!doc)return json({error:"Document not found"},404);
    if(doc.status!=="accepted"||doc.deleted_at)return json({error:"Document is no longer available"},403);
    const {data:entitled,error:entitlementError}=await caller.from("documents").select("id").eq("id",doc.id).maybeSingle();
    if(entitlementError)throw entitlementError;
    if(!entitled)return json({error:"Document access denied"},403);
    if(action==="view")return json({success:true,url:portalViewerUrl(doc.id),filename:doc.original_filename,contentType:doc.content_type});
    if(action==="download_stream"){
      const {data:file,error:fileError}=await service.storage.from("client-documents").download(doc.storage_path,{}, {cache:"no-store"});
      if(fileError||!file)return json({error:"The document file is unavailable."},404);
      return new Response(file,{status:200,headers:{
        ...corsHeaders,
        "Content-Type":safeContentType(doc.content_type),
        "Content-Disposition":contentDisposition(doc.original_filename),
        "Content-Length":String(file.size),
        "Cache-Control":"private, no-store, max-age=0",
        "X-Content-Type-Options":"nosniff",
      }});
    }
    // Keep the short-lived signed-link response for older cached portal builds.
    const {data:signed,error:signError}=await service.storage.from("client-documents").createSignedUrl(doc.storage_path,1800,{download:action==="download"?doc.original_filename:false});
    if(signError||!signed?.signedUrl)throw signError??new Error("Could not create secure document link");
    return json({success:true,url:signed.signedUrl,expiresIn:1800,filename:doc.original_filename,contentType:doc.content_type});
  }catch(e){
    const message=e instanceof Error?e.message:"Document access failed";
    return json({error:message},/session|access|membership|inactive/i.test(message)?403:400);
  }
});
