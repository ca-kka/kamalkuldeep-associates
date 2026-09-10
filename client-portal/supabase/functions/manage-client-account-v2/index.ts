import { corsHeaders, json, requireStaff } from "../_shared/portal.ts";
const clean=(v:unknown)=>String(v??"").trim();
const upper=(v:unknown)=>clean(v).toUpperCase()||null;
const emailOk=(v:string)=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const mobileOk=(v:string)=>!v||/^[+()\-\s\d]{7,20}$/.test(v);
const panOk=(v:string|null)=>!v||/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v);
const tanOk=(v:string|null)=>!v||/^[A-Z]{4}[0-9]{5}[A-Z]$/.test(v);
const cinOk=(v:string|null)=>!v||/^[A-Z0-9]{21}$/.test(v);
const gstOk=(v:string|null)=>!v||/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/.test(v);
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
 const {user,service}=await requireStaff(req);
 try{
  const b=await req.json(),action=clean(b.action),clientId=clean(b.clientId);
  if(!clientId)return json({error:"Client ID is required"},400);
  const {data:actor}=await service.from("profiles").select("role").eq("id",user.id).maybeSingle();
  if(actor?.role!=="admin")return json({error:"Admin access required"},403);
  const {data:client,error:ce}=await service.from("clients").select("*").eq("id",clientId).maybeSingle();
  if(ce)throw ce;if(!client)return json({error:"Client not found"},404);
  const {data:membership}=await service.from("client_memberships").select("user_id,can_upload").eq("client_id",clientId).limit(1).maybeSingle();
  const userId=membership?.user_id??null;
  if(action==="get_details"){
   let email=null,fullName=null;
   if(userId){const {data:a}=await service.auth.admin.getUserById(userId);email=a.user?.email??null;const {data:p}=await service.from("profiles").select("full_name").eq("id",userId).maybeSingle();fullName=p?.full_name??null}
   return json({ok:true,email,fullName,client:{id:client.id,legal_name:client.legal_name,display_name:client.display_name,pan:client.pan,tan:client.tan,cin:client.cin,gstin:client.gstin,mobile:client.mobile,filename_aliases:client.filename_aliases,active:client.active,can_upload:membership?.can_upload??false}});
  }
  if(action==="update_profile"){
   const legalName=clean(b.legalName),displayName=clean(b.displayName)||legalName,fullName=clean(b.fullName)||displayName,email=clean(b.email).toLowerCase(),mobile=clean(b.mobile);
   const pan=upper(b.pan),tan=upper(b.tan),cin=upper(b.cin),gstin=upper(b.gstin),aliases=Array.isArray(b.aliases)?b.aliases.map(clean).filter(Boolean).slice(0,20):[];
   if(!legalName||legalName.length>200)return json({error:"A valid legal name is required"},400);
   if(!emailOk(email))return json({error:"A valid client email is required"},400);
   if(!mobileOk(mobile))return json({error:"Mobile number has an invalid format"},400);
   if(![pan,tan,cin,gstin].some(Boolean))return json({error:"At least one PAN, TAN, CIN or GSTIN is required"},400);
   if(!panOk(pan)||!tanOk(tan)||!cinOk(cin)||!gstOk(gstin))return json({error:"One or more tax identifiers has an invalid format"},400);
   const filters=[pan&&`pan.eq.${pan}`,tan&&`tan.eq.${tan}`,cin&&`cin.eq.${cin}`,gstin&&`gstin.eq.${gstin}`].filter(Boolean).join(",");
   if(filters){const {data:duplicate}=await service.from("clients").select("id").neq("id",clientId).or(filters).limit(1).maybeSingle();if(duplicate)return json({error:"Another client already uses one of these identifiers"},409)}
   if(userId){const {data:a}=await service.auth.admin.getUserById(userId);if(a.user?.email?.toLowerCase()!==email){const {error:e}=await service.auth.admin.updateUserById(userId,{email,email_confirm:true});if(e)throw e}const {error:p}=await service.from("profiles").update({full_name:fullName}).eq("id",userId);if(p)throw p}
   const {error:c}=await service.from("clients").update({legal_name:legalName,display_name:displayName,pan,tan,cin,gstin,mobile,filename_aliases:aliases}).eq("id",clientId);if(c)throw c;
   return json({ok:true});
  }
  if(action==="set_password"){if(!userId)return json({error:"This client has no linked login"},409);const password=String(b.password??"");if(password.length<10||password.length>72)return json({error:"Temporary password must be 10 to 72 characters"},400);const {error}=await service.auth.admin.updateUserById(userId,{password});if(error)throw error;return json({ok:true})}
  if(action==="set_upload"){if(!membership)return json({error:"This client has no linked login"},409);const {error}=await service.from("client_memberships").update({can_upload:b.canUpload===true}).eq("client_id",clientId).eq("user_id",userId);if(error)throw error;return json({ok:true})}
  if(action==="deactivate"||action==="activate"){const active=action==="activate";const {error:c}=await service.from("clients").update({active}).eq("id",clientId);if(c)throw c;if(userId){const {error:p}=await service.from("profiles").update({active}).eq("id",userId);if(p)throw p}return json({ok:true,active})}
  if(action==="delete"){
   if(clean(b.confirmName).toLowerCase()!==clean(client.legal_name).toLowerCase())return json({error:"The client legal name confirmation does not match"},400);
   if(b.backupConfirmed!==true||b.finalConfirmed!==true)return json({error:"Both deletion confirmations are required"},400);
   const {data:docs,error:de}=await service.from("documents").select("id,storage_path").eq("client_id",clientId);if(de)throw de;
   const ids=(docs??[]).map((x:any)=>x.id);
   const [u,v]=await Promise.all([service.from("document_uploads").select("object_path").eq("proposed_client_id",clientId),ids.length?service.from("document_versions").select("storage_path").in("document_id",ids):Promise.resolve({data:[],error:null} as any)]);
   if(u.error)throw u.error;if(v.error)throw v.error;
   const paths=[...new Set([...(docs??[]).map((x:any)=>x.storage_path),...(u.data??[]).map((x:any)=>x.object_path),...(v.data??[]).map((x:any)=>x.storage_path)].filter(Boolean))] as string[];
   if(paths.length){const {error:s}=await service.storage.from("client-documents").remove(paths);if(s)throw s}
   await service.from("audit_logs").insert({actor_id:user.id,client_id:clientId,action:"client_permanently_deleted",entity_type:"client",entity_id:clientId,metadata:{legal_name:client.legal_name,storage_objects_deleted:paths.length}});
   const {error:c}=await service.from("clients").delete().eq("id",clientId);if(c)throw c;
   if(userId){const {error:a}=await service.auth.admin.deleteUser(userId);if(a)throw a}
   return json({ok:true,deleted:true});
  }
  return json({error:"Unsupported client management action"},400);
 }catch(error){return json({error:error instanceof Error?error.message:"Client management action failed"},400)}
});
