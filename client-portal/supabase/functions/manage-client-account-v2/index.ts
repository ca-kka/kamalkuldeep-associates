import { corsHeaders, json, requireStaff } from "../_shared/portal.ts";
const clean=(v:unknown)=>String(v??"").trim();
const upper=(v:unknown)=>clean(v).toUpperCase()||null;
const emailOk=(v:string)=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const mobileOk=(v:string)=>!v||/^[+()\-\s\d]{7,20}$/.test(v);
const panOk=(v:string|null)=>!v||/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v);
const tanOk=(v:string|null)=>!v||/^[A-Z]{4}[0-9]{5}[A-Z]$/.test(v);
const cinOk=(v:string|null)=>!v||/^[A-Z0-9]{21}$/.test(v);
const gstOk=(v:string|null)=>!v||/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/.test(v);

async function cleanupOneDrive(req:Request,clientId:string){
 const auth=req.headers.get("Authorization");if(!auth)throw new Error("Missing staff session");
 const ep=`${Deno.env.get("SUPABASE_URL")}/functions/v1/onedrive-directory`;
 for(const area of ["gst","tds","income_tax","accounts","mca","other"]){
  const r=await fetch(ep,{method:"POST",headers:{"Content-Type":"application/json",Authorization:auth},body:JSON.stringify({operation:"inspect_directory",clientId,area})});
  const d=await r.json().catch(()=>({}));
  if(!r.ok){const m=String(d.error??"");if(/onedrive is not connected/i.test(m))return;throw new Error(`OneDrive ${area} inspection failed: ${m||"Unable to inspect the client workspace."}`);}
  const itemId=d.parent?.id;if(!itemId)continue;
  const dr=await fetch(ep,{method:"POST",headers:{"Content-Type":"application/json",Authorization:auth},body:JSON.stringify({operation:"delete_item",driveItemId:itemId})});
  const dd=await dr.json().catch(()=>({}));if(!dr.ok)throw new Error(`OneDrive ${area} deletion failed: ${dd.error||"Unable to delete the client workspace."}`);
 }
}

Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
 const {user,service}=await requireStaff(req);
 try{
  const b=await req.json(),action=clean(b.action),clientId=clean(b.clientId);if(!clientId)return json({error:"Client ID is required"},400);
  const {data:actor}=await service.from("profiles").select("role").eq("id",user.id).maybeSingle();if(actor?.role!=="admin")return json({error:"Admin access required"},403);
  const {data:client,error:ce}=await service.from("clients").select("*").eq("id",clientId).maybeSingle();if(ce)throw ce;if(!client)return json({error:"Client not found"},404);
  const {data:membership}=await service.from("client_memberships").select("user_id,can_upload").eq("client_id",clientId).limit(1).maybeSingle();const userId=membership?.user_id??null;
  if(action==="get_details"){
   let email=null,fullName=null;if(userId){const {data:a}=await service.auth.admin.getUserById(userId);email=a.user?.email??null;const {data:p}=await service.from("profiles").select("full_name").eq("id",userId).maybeSingle();fullName=p?.full_name??null;}
   return json({ok:true,email,fullName,client:{id:client.id,legal_name:client.legal_name,display_name:client.display_name,pan:client.pan,tan:client.tan,cin:client.cin,gstin:client.gstin,mobile:client.mobile,filename_aliases:client.filename_aliases,active:client.active,can_upload:membership?.can_upload??false}});
  }
  if(action==="update_profile"){
   const legalName=clean(b.legalName),displayName=clean(b.displayName)||legalName,fullName=clean(b.fullName)||displayName,email=clean(b.email).toLowerCase(),mobile=clean(b.mobile),pan=upper(b.pan),tan=upper(b.tan),cin=upper(b.cin),gstin=upper(b.gstin),aliases=Array.isArray(b.aliases)?b.aliases.map(clean).filter(Boolean).slice(0,20):[];
   if(!legalName||legalName.length>200)return json({error:"A valid legal name is required"},400);if(!emailOk(email))return json({error:"A valid client email is required"},400);if(!mobileOk(mobile))return json({error:"Mobile number has an invalid format"},400);if(![pan,tan,cin,gstin].some(Boolean))return json({error:"At least one PAN, TAN, CIN or GSTIN is required"},400);if(!panOk(pan)||!tanOk(tan)||!cinOk(cin)||!gstOk(gstin))return json({error:"One or more tax identifiers has an invalid format"},400);
   if(userId){const {data:a}=await service.auth.admin.getUserById(userId);if(a.user?.email?.toLowerCase()!==email){const {error:e}=await service.auth.admin.updateUserById(userId,{email,email_confirm:true});if(e)throw e;}const {error:p}=await service.from("profiles").update({full_name:fullName}).eq("id",userId);if(p)throw p;}
   const {error:c}=await service.from("clients").update({legal_name:legalName,display_name:displayName,pan,tan,cin,gstin,mobile,filename_aliases:aliases}).eq("id",clientId);if(c)throw c;return json({ok:true});
  }
  if(action==="set_password"){if(!userId)return json({error:"This client has no linked login"},409);const password=String(b.password??"");if(password.length<10||password.length>72)return json({error:"Temporary password must be 10 to 72 characters"},400);const {error}=await service.auth.admin.updateUserById(userId,{password,app_metadata:{must_change_password:true}});if(error)throw error;
return json({ok:true,mustChangePassword:true});}
  if(action==="set_upload"){if(!membership)return json({error:"This client has no linked login"},409);const {error}=await service.from("client_memberships").update({can_upload:b.canUpload===true}).eq("client_id",clientId).eq("user_id",userId);if(error)throw error;return json({ok:true});}
  if(action==="activate"||action==="deactivate"){const active=action==="activate";const {error:c}=await service.from("clients").update({active}).eq("id",clientId);if(c)throw c;if(userId){const {error:p}=await service.from("profiles").update({active}).eq("id",userId);if(p)throw p;}return json({ok:true,active});}
  if(action==="delete"){
   if(clean(b.confirmName).toLowerCase()!==clean(client.legal_name).toLowerCase())return json({error:"The client legal name confirmation does not match"},400);if(b.backupConfirmed!==true||b.finalConfirmed!==true)return json({error:"Both deletion confirmations are required"},400);
   // Preflight all known client FKs before deleting anything external.
   const [docsQ,uploadsQ,registryQ,patternsQ,accountsQ,requestsQ,auditQ]=await Promise.all([
    service.from("documents").select("id,storage_path").eq("client_id",clientId),
    service.from("document_uploads").select("object_path").eq("proposed_client_id",clientId),
    service.from("onedrive_file_registry").select("id").eq("client_id",clientId),
    service.from("filename_patterns").select("id").eq("client_id",clientId),
    service.from("client_account_members").select("account_id").eq("client_id",clientId),
    service.from("portal_access_requests").select("id").eq("approved_client_id",clientId),
    service.from("audit_logs").select("id").eq("client_id",clientId)
   ]);
   for(const [label,q] of [["Document lookup",docsQ],["Upload lookup",uploadsQ],["OneDrive registry lookup",registryQ],["Filename pattern lookup",patternsQ],["Client account lookup",accountsQ],["Access request lookup",requestsQ],["Audit lookup",auditQ]] as any[]){if(q.error&&!/relation .* does not exist|column .* does not exist/i.test(String(q.error.message??q.error)))throw new Error(`${label} failed: ${q.error.message??q.error}`);}
   const accountIds=[...new Set((accountsQ.data??[]).map((x:any)=>x.account_id).filter(Boolean))];
   if(accountIds.length){const {data:other,error:e}=await service.from("client_account_members").select("account_id,client_id").in("account_id",accountIds).neq("client_id",clientId);if(e&&!/relation .* does not exist|column .* does not exist/i.test(String(e.message??e)))throw new Error(`Client account check failed: ${e.message}`);if(other?.length)return json({error:"This client is still part of a family account with other members. Remove or transfer those members before deleting the client."},409);}
   await cleanupOneDrive(req,clientId);
   const docs=docsQ.data??[];const docIds=docs.map((x:any)=>x.id);let paths=[...docs.map((x:any)=>x.storage_path),...(uploadsQ.data??[]).map((x:any)=>x.object_path)].filter(Boolean) as string[];
   if(docIds.length){const {data:v,error:e}=await service.from("document_versions").select("storage_path").in("document_id",docIds);if(e)throw new Error(`Document version lookup failed: ${e.message}`);paths.push(...(v??[]).map((x:any)=>x.storage_path).filter(Boolean));}
   const uniquePaths=[...new Set(paths)];if(uniquePaths.length){const {error:s}=await service.storage.from("client-documents").remove(uniquePaths);if(s)throw new Error(`Storage cleanup failed: ${s.message}`);}
   const deleteRows=async(table:string,column:string,value:string)=>{const {error:e}=await service.from(table).delete().eq(column,value);if(e&&!/relation .* does not exist|column .* does not exist/i.test(String(e.message??e)))throw new Error(`Deleting ${table} failed: ${e.message}`);};
   for(const docId of docIds)await deleteRows("document_versions","document_id",docId);
   for(const [table,column] of [["documents","client_id"],["document_uploads","proposed_client_id"],["onedrive_file_registry","client_id"],["filename_patterns","client_id"],["client_memberships","client_id"]] as any[])await deleteRows(table,column,clientId);
   if(accountIds.length)await deleteRows("client_account_members","client_id",clientId);
   if((requestsQ.data??[]).length){const {error:e}=await service.from("portal_access_requests").update({approved_client_id:null}).eq("approved_client_id",clientId);if(e&&!/column .* does not exist/i.test(String(e.message??e)))throw new Error(`Clearing access request links failed: ${e.message}`);}
   if((auditQ.data??[]).length){const {error:e}=await service.from("audit_logs").update({client_id:null}).eq("client_id",clientId);if(e)throw new Error(`Detaching audit history failed: ${e.message}`);}
   const {error:c}=await service.from("clients").delete().eq("id",clientId);if(c)throw new Error(`Client record deletion failed: ${c.message}`);
   // Auth users cannot be deleted while audit_logs.actor_id still references them.
   // Preserve the audit history but detach the soon-to-be-deleted actor first.
   if(userId){const {error:e}=await service.from("audit_logs").update({actor_id:null}).eq("actor_id",userId);if(e)throw new Error(`Detaching auth audit history failed: ${e.message}`);const {error:a}=await service.auth.admin.deleteUser(userId);const m=String(a?.message??a??"");if(a&&!/not found|resource cannot be found|user.*not found/i.test(m))throw new Error(`Auth user deletion failed: ${m}`);}
   const {error:ae}=await service.from("audit_logs").insert({actor_id:user.id,client_id:null,action:"client_permanently_deleted",entity_type:"client",entity_id:clientId,metadata:{legal_name:client.legal_name,storage_objects_deleted:uniquePaths.length,onedrive_cleanup:true}});if(ae)throw new Error(`Deletion audit failed: ${ae.message}`);
   return json({ok:true,deleted:true,onedriveDeleted:true,storageObjectsDeleted:uniquePaths.length});
  }
  return json({error:"Unsupported client management action"},400);
 }catch(error){return json({error:error instanceof Error?error.message:"Client management action failed"},400)}
});