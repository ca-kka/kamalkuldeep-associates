import { corsHeaders, json, requireStaff } from "../_shared/portal.ts";

const clean=(v:unknown)=>String(v??"").trim();
const upper=(v:unknown)=>clean(v).toUpperCase()||null;
const emailOk=(v:string)=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const panOk=(v:string|null)=>!v||/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v);
const tanOk=(v:string|null)=>!v||/^[A-Z]{4}[0-9]{5}[A-Z]$/.test(v);
const cinOk=(v:string|null)=>!v||/^[A-Z0-9]{21}$/.test(v);
const gstOk=(v:string|null)=>!v||/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/.test(v);

Deno.serve(async req=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:corsHeaders});
  const {user,service}=await requireStaff(req);
  const {data:actor}=await service.from("profiles").select("role").eq("id",user.id).maybeSingle();
  if(actor?.role!=="admin") return json({error:"Admin access required"},403);
  try{
    const b=await req.json();
    const clientId=clean(b.clientId);
    const action=clean(b.action);
    if(!clientId) return json({error:"Client ID is required"},400);
    const {data:client,error:clientError}=await service.from("clients").select("*").eq("id",clientId).maybeSingle();
    if(clientError) throw clientError;
    if(!client) return json({error:"Client not found"},404);
    const {data:membership}=await service.from("client_memberships").select("user_id,can_upload").eq("client_id",clientId).limit(1).maybeSingle();
    const userId=membership?.user_id??null;

    if(action==="get_details"){
      let email=null,fullName=null;
      if(userId){
        const {data:authUser}=await service.auth.admin.getUserById(userId);
        email=authUser.user?.email??null;
        const {data:profile}=await service.from("profiles").select("full_name").eq("id",userId).maybeSingle();
        fullName=profile?.full_name??null;
      }
      return json({ok:true,email,fullName,client:{legal_name:client.legal_name,display_name:client.display_name,pan:client.pan,tan:client.tan,cin:client.cin,gstin:client.gstin,filename_aliases:client.filename_aliases,active:client.active,can_upload:membership?.can_upload??false}});
    }

    if(action==="update_profile"){
      const legalName=clean(b.legalName),displayName=clean(b.displayName)||legalName,fullName=clean(b.fullName)||displayName;
      const email=clean(b.email).toLowerCase();
      const pan=upper(b.pan),tan=upper(b.tan),cin=upper(b.cin),gstin=upper(b.gstin);
      const aliases=Array.isArray(b.aliases)?b.aliases.map(clean).filter(Boolean).slice(0,20):[];
      if(!legalName||legalName.length>200)return json({error:"A valid legal name is required"},400);
      if(!emailOk(email))return json({error:"A valid client email is required"},400);
      if(![pan,tan,cin,gstin].some(Boolean))return json({error:"At least one PAN, TAN, CIN or GSTIN is required"},400);
      if(!panOk(pan)||!tanOk(tan)||!cinOk(cin)||!gstOk(gstin))return json({error:"One or more tax identifiers has an invalid format"},400);
      const filters=[pan&&`pan.eq.${pan}`,tan&&`tan.eq.${tan}`,cin&&`cin.eq.${cin}`,gstin&&`gstin.eq.${gstin}`].filter(Boolean).join(",");
      const {data:duplicate}=await service.from("clients").select("id").neq("id",clientId).or(filters).limit(1).maybeSingle();
      if(duplicate)return json({error:"Another client already uses one of these identifiers"},409);
      if(userId){
        const {data:authUser}=await service.auth.admin.getUserById(userId);
        if(authUser.user?.email?.toLowerCase()!==email){
          const {error:e}=await service.auth.admin.updateUserById(userId,{email,email_confirm:true});
          if(e)throw e;
        }
        const {error:p}=await service.from("profiles").update({full_name:fullName}).eq("id",userId);
        if(p)throw p;
      }
      const {error:c}=await service.from("clients").update({legal_name:legalName,display_name:displayName,pan,tan,cin,gstin,filename_aliases:aliases}).eq("id",clientId);
      if(c)throw c;
      await service.from("audit_logs").insert({actor_id:user.id,client_id:clientId,action:"client_profile_updated",entity_type:"client",entity_id:clientId,metadata:{email,legal_name:legalName}});
      return json({ok:true});
    }

    if(action==="set_password"){
      if(!userId)return json({error:"This client has no linked login"},409);
      const password=String(b.password??"");
      if(password.length<10||password.length>72)return json({error:"Temporary password must be 10 to 72 characters"},400);
      const {error}=await service.auth.admin.updateUserById(userId,{password});
      if(error)throw error;
      await service.from("audit_logs").insert({actor_id:user.id,client_id:clientId,action:"client_password_reset",entity_type:"client",entity_id:clientId,metadata:{temporary:true}});
      return json({ok:true});
    }

    if(action==="set_upload"){
      const canUpload=b.canUpload===true;
      if(!membership)return json({error:"This client has no linked login"},409);
      const {error}=await service.from("client_memberships").update({can_upload:canUpload}).eq("client_id",clientId).eq("user_id",userId);
      if(error)throw error;
      await service.from("audit_logs").insert({actor_id:user.id,client_id:clientId,action:"client_upload_permission_changed",entity_type:"client",entity_id:clientId,metadata:{can_upload:canUpload}});
      return json({ok:true});
    }

    if(action==="deactivate"||action==="activate"){
      const active=action==="activate";
      const {error:c}=await service.from("clients").update({active}).eq("id",clientId);
      if(c)throw c;
      if(userId){const {error:p}=await service.from("profiles").update({active}).eq("id",userId);if(p)throw p;}
      await service.from("audit_logs").insert({actor_id:user.id,client_id:clientId,action:active?"client_activated":"client_deactivated",entity_type:"client",entity_id:clientId,metadata:{active}});
      return json({ok:true,active});
    }

    if(action==="delete"){
      const {count:docCount}=await service.from("documents").select("id",{count:"exact",head:true}).eq("client_id",clientId);
      if((docCount??0)>0)return json({error:`Client cannot be permanently deleted because ${docCount} document(s) are linked to it. Deactivate the client instead.`},409);
      const {count:uploadCount}=await service.from("document_uploads").select("id",{count:"exact",head:true}).eq("proposed_client_id",clientId);
      if((uploadCount??0)>0)return json({error:`Client cannot be permanently deleted because ${uploadCount} upload record(s) are linked to it.`},409);
      await service.from("audit_logs").update({client_id:null}).eq("client_id",clientId);
      const {error:m}=await service.from("client_memberships").delete().eq("client_id",clientId);
      if(m)throw m;
      const {error:c}=await service.from("clients").delete().eq("id",clientId);
      if(c)throw c;
      if(userId){const {error:a}=await service.auth.admin.deleteUser(userId);if(a)throw a;}
      return json({ok:true,deleted:true});
    }

    return json({error:"Unsupported client management action"},400);
  }catch(error){
    return json({error:error instanceof Error?error.message:"Client management action failed"},400);
  }
});
