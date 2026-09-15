import { corsHeaders, json, requireStaff } from "../_shared/portal.ts";

const clean=(v:unknown)=>String(v??"").trim();
const upper=(v:unknown)=>clean(v).toUpperCase()||null;
const emailOk=(v:string)=>/^\S+@\S+\.\S+$/.test(v);
const panOk=(v:string|null)=>!v||/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v);
const tanOk=(v:string|null)=>!v||/^[A-Z]{4}[0-9]{5}[A-Z]$/.test(v);
const cinOk=(v:string|null)=>!v||/^[A-Z0-9]{21}$/.test(v);
const gstOk=(v:string|null)=>!v||/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/.test(v);
const mobileOk=(v:string|null)=>!v||/^[0-9+()\-\s]{7,20}$/.test(v);

function generatePassword(){
  const alphabet="ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const bytes=new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes,b=>alphabet[b%alphabet.length]).join("");
}

async function sendWelcomeEmail(email:string,fullName:string,password:string){
  const apiKey=Deno.env.get("RESEND_API_KEY");
  if(!apiKey)return {sent:false,error:"RESEND_API_KEY is not configured"};
  const text=`Kamal Kuldeep & Associates\n\nWelcome to your KKA Client Portal\n\nDear ${fullName||"Client"},\n\nYour KKA Client Portal account has been created successfully.\n\nLogin email: ${email}\nTemporary password: ${password}\nPortal: https://portal.ca-kka.com\n\nPlease change this temporary password after your first login and do not share it with anyone.\n\nIf you did not expect this account, please contact KKA directly.\n\nRegards,\nKamal Kuldeep & Associates`;
  const r=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({from:"Kamal Kuldeep & Associates <notifications@notify.ca-kka.com>",to:[email],reply_to:["notifications@notify.ca-kka.com"],subject:"Welcome to your KKA Client Portal",text})});
  if(!r.ok)return {sent:false,error:`Resend returned ${r.status}`};
  const d=await r.json().catch(()=>({}));
  return {sent:true,id:d.id??null};
}

Deno.serve(async req=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
  const {user,service}=await requireStaff(req);
  let clientId:string|null=null,userId:string|null=null;
  try{
    const b=await req.json();
    const legalName=clean(b.legalName),displayName=clean(b.displayName)||legalName;
    const email=clean(b.email).toLowerCase();
    const fullName=clean(b.fullName)||displayName;
    const pan=upper(b.pan),tan=upper(b.tan),cin=upper(b.cin),gstin=upper(b.gstin);
    const mobile=clean(b.mobile)||null;
    const aliases=Array.isArray(b.aliases)?b.aliases.map(clean).filter(Boolean).slice(0,20):[];
    const canUpload=b.canUpload===true;
    if(!legalName||legalName.length>200)return json({error:"A valid legal name is required"},400);
    if(!emailOk(email))return json({error:"A valid client email is required"},400);
    if(![pan,tan,cin,gstin].some(Boolean))return json({error:"At least one PAN, TAN, CIN or GSTIN is required"},400);
    if(!panOk(pan)||!tanOk(tan)||!cinOk(cin)||!gstOk(gstin))return json({error:"One or more tax identifiers has an invalid format"},400);
    if(!mobileOk(mobile))return json({error:"Mobile number has an invalid format"},400);

    // Client names are intentionally not unique. Check each business identifier explicitly.
    const conflicts:[[string,string|null]]=[ ["PAN",pan],["TAN",tan],["CIN",cin],["GSTIN",gstin] ];
    for(const [label,value] of conflicts){
      if(!value)continue;
      const {data:existing,error}=await service.from("clients").select("id,legal_name,active").eq(label.toLowerCase(),value).maybeSingle();
      if(error)throw error;
      if(existing)return json({error:`A client with this ${label} already exists. Client: ${existing.legal_name||existing.id}.`},409);
    }

    // Reconcile an Auth orphan left by an interrupted/legacy deletion, but never touch
    // an existing staff/admin identity or an identity with a client membership.
    const {data:authMatches,error:authLookupError}=await service.schema("auth").from("users").select("id,email").eq("email",email).limit(2);
    if(authLookupError)throw authLookupError;
    if(authMatches?.length){
      for(const oldUser of authMatches){
        const {data:oldProfile}=await service.from("profiles").select("id,role,active").eq("id",oldUser.id).maybeSingle();
        const {data:membership}=await service.from("client_memberships").select("client_id").eq("user_id",oldUser.id).limit(1).maybeSingle();
        if(oldProfile && ["admin","staff"].includes(oldProfile.role))return json({error:"This email address belongs to an existing KKA staff or administrator account."},409);
        if(membership)return json({error:"This email address is already assigned to an existing client login."},409);
        const {error:deleteError}=await service.auth.admin.deleteUser(oldUser.id);
        if(deleteError)throw deleteError;
        await service.from("profiles").delete().eq("id",oldUser.id);
      }
    }

    const {data:client,error:clientError}=await service.from("clients").insert({legal_name:legalName,display_name:displayName,mobile,pan,tan,cin,gstin,filename_aliases:aliases,active:true}).select("id").single();
    if(clientError)throw clientError;
    clientId=client.id;
    const password=generatePassword();
    const {data:authData,error:authError}=await service.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:fullName}});
    if(authError||!authData.user)throw authError??new Error("Client login could not be created");
    userId=authData.user.id;
    const {error:profileError}=await service.from("profiles").update({full_name:fullName,role:"client",active:true}).eq("id",userId);
    if(profileError)throw profileError;
    const {error:membershipError}=await service.from("client_memberships").insert({client_id:client.id,user_id:userId,can_upload:canUpload});
    if(membershipError)throw membershipError;
    await service.from("audit_logs").insert({actor_id:user.id,client_id:client.id,action:"client_login_created",entity_type:"client",entity_id:client.id,metadata:{email,can_upload:canUpload}});
    const welcome=await sendWelcomeEmail(email,fullName,password).catch(e=>({sent:false,error:e instanceof Error?e.message:"Unknown email error"}));
    await service.from("audit_logs").insert({actor_id:user.id,client_id:client.id,action:welcome.sent?"client_welcome_email_sent":"client_welcome_email_failed",entity_type:"client",entity_id:client.id,metadata:{email,email_id:welcome.id??null,error:welcome.error??null}});
    return json({ok:true,clientId:client.id,userId,email,emailSent:welcome.sent,emailId:welcome.id??null});
  }catch(error){
    if(userId)await service.auth.admin.deleteUser(userId);
    if(clientId)await service.from("clients").delete().eq("id",clientId);
    const message=error instanceof Error?error.message:"Client account could not be created";
    return json({error:message.includes("duplicate key")?"This client or login already exists. Refresh the client list and verify the identifiers before trying again.":message},409);
  }
});
