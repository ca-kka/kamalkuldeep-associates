import { createSupabaseContext } from "npm:@supabase/server@^1";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED = Deno.env.get("PORTAL_ALLOWED_ORIGIN") ?? "https://portal.ca-kka.com";
const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Expose-Headers": "Content-Disposition, Content-Type, X-KKA-PDF-Header-Offset",
};

function fail(message:string,status:number){
  return new Response(message,{status,headers:{...corsHeaders,"Content-Type":"text/plain; charset=utf-8","Cache-Control":"no-store"}});
}
function filename(name:string){
  return String(name||"document").replace(/[\u0000-\u001f\u007f\/\\"]/g,"_").replace(/[^\x20-\x7e]/g,"_").slice(0,180)||"document";
}

export default {
  fetch: async (req: Request) => {
    if(req.method === "OPTIONS") return new Response("ok",{headers:corsHeaders});
    const { data: ctx, error: authError } = await createSupabaseContext(req, { auth: "user" });
    if (authError || !ctx) return fail(authError?.message || "Authentication required.", authError?.status || 401);
    if(req.method !== "GET") return fail("GET requests only.",405);

    try {
    const userId = ctx.userClaims?.id ?? ctx.userClaims?.sub;
    if(!userId) return fail("Authentication required.",401);

      const service = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        {auth:{autoRefreshToken:false,persistSession:false}}
      );
      const authorization=req.headers.get("Authorization");
      if(!authorization)return fail("Authentication required.",401);
      const caller=createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        {global:{headers:{Authorization:authorization}},auth:{autoRefreshToken:false,persistSession:false}}
      );

      const {data:profile,error:profileError}=await service
        .from("profiles").select("role,active").eq("id",userId).maybeSingle();
      if(profileError) throw profileError;
      if(!profile?.active) return fail("Your KKA account is inactive.",403);

      const url=new URL(req.url);
      const documentId=decodeURIComponent(url.searchParams.get("documentId")||"");
      if(!documentId) return fail("Document ID is required.",400);

      const {data:doc,error:docError}=await service
        .from("documents")
        .select("id,client_id,storage_path,original_filename,content_type,byte_size,status,deleted_at")
        .eq("id",documentId).maybeSingle();
      if(docError) throw docError;
      if(!doc) return fail("Document not found.",404);
      if(doc.status!=="accepted"||doc.deleted_at) return fail("Document is no longer available.",403);

      const {data:entitled,error:entitlementError}=await caller
        .from("documents").select("id").eq("id",doc.id).maybeSingle();
      if(entitlementError) throw entitlementError;
      if(!entitled) return fail("Document access denied.",403);

      const {data:file,error:fileError}=await service.storage
        .from("client-documents").download(doc.storage_path);
      if(fileError||!file) {
        console.error("document-view storage download failed",fileError);
        return fail("The document file is unavailable.",404);
      }

      const bytes=await file.arrayBuffer();
      if(bytes.byteLength<3) return fail("The stored document is empty.",500);

      // PDF readers commonly locate the %PDF- header within the first 1024
      // bytes. Do not reject otherwise-valid PDFs merely because a producer
      // prepended a BOM/whitespace or other harmless prefix.
      const probe=new Uint8Array(bytes.slice(0,Math.min(bytes.byteLength,1024)));
      let pdfHeaderOffset=-1;
      for(let i=0;i<=probe.length-5;i++){
        if(probe[i]===0x25&&probe[i+1]===0x50&&probe[i+2]===0x44&&probe[i+3]===0x46&&probe[i+4]===0x2d){
          pdfHeaderOffset=i;
          break;
        }
      }
      const isPdf=pdfHeaderOffset>=0;
      const isJpeg=probe[0]===0xff&&probe[1]===0xd8&&probe[2]===0xff;
      const isPng=probe.length>=8&&probe[0]===0x89&&probe[1]===0x50&&probe[2]===0x4e&&probe[3]===0x47&&probe[4]===0x0d&&probe[5]===0x0a&&probe[6]===0x1a&&probe[7]===0x0a;
      if(!isPdf&&!isJpeg&&!isPng){
        const signature=Array.from(probe.slice(0,32)).map(v=>v.toString(16).padStart(2,"0")).join(" ");
        console.warn("document-view preview unavailable for file type",{documentId,storagePath:doc.storage_path,signature,contentType:doc.content_type,byteLength:bytes.byteLength});
        return fail("Preview is not available for this file type.",415);
      }

      const headers=new Headers(corsHeaders);
      if(isPdf)headers.set("X-KKA-PDF-Header-Offset",String(pdfHeaderOffset));
      headers.set("Content-Type",isPdf?"application/pdf":isJpeg?"image/jpeg":"image/png");
      headers.set("Content-Disposition",`inline; filename="${filename(doc.original_filename)}"`);
      headers.set("Content-Length",String(bytes.byteLength));
      headers.set("Cache-Control","private, no-store, max-age=0");
      headers.set("X-Content-Type-Options","nosniff");
      return new Response(bytes,{status:200,headers});
    } catch(error) {
      console.error("document-view",error);
      return fail("The document could not be opened.",500);
    }
  }
};
