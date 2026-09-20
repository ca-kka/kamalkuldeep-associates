import { createSupabaseContext } from "npm:@supabase/server@^1";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED = Deno.env.get("PORTAL_ALLOWED_ORIGIN") ?? "https://portal.ca-kka.com";
const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function fail(message:string,status:number){
  return new Response(message,{status,headers:{...corsHeaders,"Content-Type":"text/plain; charset=utf-8","Cache-Control":"no-store"}});
}
function filename(name:string){
  return String(name||"document.pdf").replace(/[\r\n"]/g,"_").slice(0,180);
}

export default {
  fetch: async (req: Request) => {
    const { data: ctx, error: authError } = await createSupabaseContext(req, { auth: "user" });
    if (authError || !ctx) return fail(authError?.message || "Authentication required.", authError?.status || 401);
    if(req.method === "OPTIONS") return new Response("ok",{headers:corsHeaders});
    if(req.method !== "GET") return fail("GET requests only.",405);

    try {
    const userId = ctx.userClaims?.id ?? ctx.userClaims?.sub;
    if(!userId) return fail("Authentication required.",401);

      const service = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        {auth:{autoRefreshToken:false,persistSession:false}}
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

      const isStaff=profile.role==="admin"||profile.role==="staff";
      if(!isStaff){
        if(profile.role!=="client"||!doc.client_id) return fail("Document access denied.",403);
        const {data:membership,error:membershipError}=await service
          .from("client_memberships").select("client_id")
          .eq("user_id",userId).eq("client_id",doc.client_id).maybeSingle();
        if(membershipError) throw membershipError;
        if(!membership?.client_id) return fail("Document access denied.",403);
      }

      const {data:file,error:fileError}=await service.storage
        .from("client-documents").download(doc.storage_path);
      if(fileError||!file) {
        console.error("document-view storage download failed",fileError);
        return fail("The document file is unavailable.",404);
      }

      const bytes=await file.arrayBuffer();
      if(bytes.byteLength<5) return fail("The stored document is empty.",500);

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
      if(pdfHeaderOffset<0){
        const signature=Array.from(probe.slice(0,32)).map(v=>v.toString(16).padStart(2,"0")).join(" ");
        console.error("document-view non-pdf object",{documentId,storagePath:doc.storage_path,signature,contentType:doc.content_type,byteLength:bytes.byteLength});
        return fail("The stored document is not a valid PDF.",500);
      }

      const headers=new Headers(corsHeaders);
      headers.set("X-KKA-PDF-Header-Offset",String(pdfHeaderOffset));
      headers.set("Content-Type","application/pdf");
      headers.set("Content-Disposition",`inline; filename="${filename(doc.original_filename)}"`);
      headers.set("Content-Length",String(bytes.byteLength));
      headers.set("Cache-Control","private, no-store, max-age=0");
      headers.set("X-Content-Type-Options","nosniff");
      headers.set("Accept-Ranges","bytes");

      return new Response(bytes,{status:200,headers});
    } catch(error) {
      console.error("document-view",error);
      return fail("The document could not be opened.",500);
    }
  }
};