const enc=new TextEncoder();
const dec=new TextDecoder();
function b64u(input){const bytes=typeof input==='string'?enc.encode(input):input;let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'')}
function b64(input){const bytes=typeof input==='string'?enc.encode(input):input;let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s)}
function unb64u(s){s=s.replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';const bin=atob(s),out=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);return out}
function unb64(s){return dec.decode(Uint8Array.from(atob(s.replace(/\n/g,'')),c=>c.charCodeAt(0)))}
async function key(secret){return crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify'])}
async function sign(value,secret){const sig=await crypto.subtle.sign('HMAC',await key(secret),enc.encode(value));return `${value}.${b64u(new Uint8Array(sig))}`}
async function verify(value,secret){if(!value)return null;const p=value.lastIndexOf('.');if(p<1)return null;const raw=value.slice(0,p),sig=value.slice(p+1);try{return await crypto.subtle.verify('HMAC',await key(secret),unb64u(sig),enc.encode(raw))?raw:null}catch{return null}}
function cookie(name,value,maxAge,domain=''){return `${name}=${value}; Path=/; Max-Age=${maxAge}${domain?`; Domain=${domain}`:''}; HttpOnly; Secure; SameSite=Lax`}
function redirect(url,headers={}){const h=new Headers();h.set('Location',url);for(const [name,value] of Object.entries(headers)){if(name.toLowerCase()==='set-cookie'&&Array.isArray(value)){for(const item of value)h.append('Set-Cookie',item)}else h.set(name,String(value))}return new Response(null,{status:302,headers:h})}
function json(data,status=200,headers={}){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8',...headers}})}
function b64json(obj){return b64u(JSON.stringify(obj))}
function getCookie(request,name){const cookies=request.headers.get('Cookie')||'';const match=cookies.match(new RegExp('(?:^|; )'+name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'=([^;]+)'));return match?match[1]:''}
async function authenticatedSession(request,secret,allowedEmail){const token=getCookie(request,'kka_session'),raw=await verify(token,secret);if(!raw)return null;try{const payload=JSON.parse(dec.decode(unb64u(raw)));if(!payload.exp||Date.now()>payload.exp||payload.email!==allowedEmail)return null;return payload}catch{return null}}
function validDate(v){return typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)}
function validSlug(v){return typeof v==='string'&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v)&&v.length<=120}
const required=['id','title','slug','category','author','summary','content'];

export default{async fetch(request,env){
  const url=new URL(request.url),origin=env.PUBLIC_ORIGIN||'https://ca-kka.com',adminPath='/knowledge/admin/',allowedEmail=(env.ADMIN_EMAIL||'').trim().toLowerCase(),secret=env.SESSION_SECRET||'',githubToken=env.GITHUB_PUBLISH_TOKEN||'',githubRepo='ca-kka/kamalkuldeep-associates',githubPath='knowledge/data/articles.json';
  const requestOrigin=request.headers.get('Origin')||'',allowedOrigins=['https://ca-kka.com','https://www.ca-kka.com'],corsOrigin=allowedOrigins.includes(requestOrigin)?requestOrigin:'https://ca-kka.com';
  const corsHeaders={'Access-Control-Allow-Origin':corsOrigin,'Access-Control-Allow-Credentials':'true','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Vary':'Origin'};
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:corsHeaders});
  if(!env.GOOGLE_CLIENT_ID||!env.GOOGLE_CLIENT_SECRET||!env.REDIRECT_URI||!allowedEmail||!secret)return json({error:'Authentication service is not configured.'},503,corsHeaders);
  if(url.pathname==='/config')return json({clientId:env.GOOGLE_CLIENT_ID,redirectUri:env.REDIRECT_URI,adminPath},200,{...corsHeaders,'Cache-Control':'no-store'});
  if(url.pathname==='/login'){
    const state=await sign(b64json({n:crypto.randomUUID(),t:Date.now()}),secret),google=new URL('https://accounts.google.com/o/oauth2/v2/auth');
    google.searchParams.set('client_id',env.GOOGLE_CLIENT_ID);google.searchParams.set('redirect_uri',env.REDIRECT_URI);google.searchParams.set('response_type','code');google.searchParams.set('scope','openid email profile');google.searchParams.set('state',state);google.searchParams.set('prompt','select_account');
    return redirect(google.toString(),{'Set-Cookie':cookie('kka_oauth_state',state,600)});
  }
  if(url.pathname==='/callback'){
    const returnedState=url.searchParams.get('state')||'',expected=getCookie(request,'kka_oauth_state'),verifiedState=await verify(returnedState,secret);if(!returnedState||returnedState!==expected||!verifiedState)return json({error:'Invalid OAuth state.'},400);
    const code=url.searchParams.get('code');if(!code)return json({error:'Google did not return an authorization code.'},400);
    const tokenResponse=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code,client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,redirect_uri:env.REDIRECT_URI,grant_type:'authorization_code'})});
    if(!tokenResponse.ok)return json({error:'Google token exchange failed.'},502);const tokens=await tokenResponse.json();if(!tokens.access_token)return json({error:'Google did not provide an access token.'},502);
    const userResponse=await fetch('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:`Bearer ${tokens.access_token}`}});if(!userResponse.ok)return json({error:'Google profile lookup failed.'},502);const user=await userResponse.json();
    if(!user.email||user.email.toLowerCase()!==allowedEmail||user.email_verified!==true)return redirect(`${origin}${adminPath}?error=not-authorized`,{'Set-Cookie':cookie('kka_session','',0,'ca-kka.com')});
    const sessionPayload=b64json({email:user.email.toLowerCase(),name:user.name||'',picture:user.picture||'',exp:Date.now()+8*60*60*1000}),session=await sign(sessionPayload,secret);
    return redirect(`${origin}${adminPath}?login=success`,{'Set-Cookie':[cookie('kka_session',session,8*60*60,'ca-kka.com'),cookie('kka_oauth_state','',0)]});
  }
  const session=await authenticatedSession(request,secret,allowedEmail);
  if(url.pathname==='/session'){
    if(!session)return json({authenticated:false},401,{...corsHeaders,'Cache-Control':'no-store'});return json({authenticated:true,user:{email:session.email,name:session.name,picture:session.picture}},200,{...corsHeaders,'Cache-Control':'no-store'});
  }
  if(url.pathname==='/articles'&&request.method==='GET'){
    if(!session)return json({error:'Authentication required.'},401,corsHeaders);if(!githubToken)return json({error:'Publishing service is not configured.'},503,corsHeaders);
    const apiBase=`https://api.github.com/repos/${githubRepo}/contents/${githubPath}`,gh={'Accept':'application/vnd.github+json','Authorization':`Bearer ${githubToken}`,'X-GitHub-Api-Version':'2026-03-10','User-Agent':'KKA-Knowledge-Centre-Publisher'};
    const r=await fetch(`${apiBase}?ref=main`,{headers:gh});if(!r.ok)return json({error:'Could not read Knowledge Centre data from GitHub.',githubStatus:r.status},502,corsHeaders);const current=await r.json();
    try{const data=JSON.parse(unb64(current.content||''));return json({items:Array.isArray(data.items)?data.items:[]},200,{...corsHeaders,'Cache-Control':'no-store'})}catch{return json({error:'Existing Knowledge Centre data is not valid JSON.'},502,corsHeaders)}
  }
  if((url.pathname==='/publish'&&request.method==='POST')||(url.pathname==='/manage'&&request.method==='POST')){
    if(!session)return json({error:'Authentication required.'},401,corsHeaders);if(!githubToken)return json({error:'Publishing service is not configured.'},503,corsHeaders);
    let payload;try{payload=await request.json()}catch{return json({error:'Invalid JSON payload.'},400,corsHeaders)}
    const apiBase=`https://api.github.com/repos/${githubRepo}/contents/${githubPath}`,gh={'Accept':'application/vnd.github+json','Authorization':`Bearer ${githubToken}`,'X-GitHub-Api-Version':'2026-03-10','User-Agent':'KKA-Knowledge-Centre-Publisher'};
    const r=await fetch(`${apiBase}?ref=main`,{headers:gh});if(!r.ok)return json({error:'Could not read Knowledge Centre data from GitHub.',githubStatus:r.status},502,corsHeaders);const current=await r.json();
    let data;try{data=JSON.parse(unb64(current.content||''))}catch{return json({error:'Existing Knowledge Centre data is not valid JSON.'},502,corsHeaders)}if(!Array.isArray(data.items))data.items=[];
    let message='';
    if(url.pathname==='/manage'){
      const action=payload.action,id=typeof payload.id==='string'?payload.id.trim():'';if(!id)return json({error:'Article ID is required.'},400,corsHeaders);const index=data.items.findIndex(x=>x.id===id);if(index<0)return json({error:'Article not found.'},404,corsHeaders);
      if(action==='unpublish'){data.items[index]={...data.items[index],status:'draft',updatedAt:new Date().toISOString().slice(0,10)};message='Article unpublished and kept as a draft.'}
      else if(action==='delete'){data.items.splice(index,1);message='Article permanently deleted.'}
      else return json({error:'Unsupported management action.'},400,corsHeaders);
    }else{
      if(required.some(k=>typeof payload[k]!=='string'||!payload[k].trim()))return json({error:'Article is missing a required field.'},400,corsHeaders);
      if(!validSlug(payload.slug))return json({error:'Slug must contain only lowercase letters, numbers and hyphens.'},400,corsHeaders);if(!validDate(payload.publishedAt)||!validDate(payload.updatedAt))return json({error:'Published and updated dates must use YYYY-MM-DD.'},400,corsHeaders);if(!['approved','published'].includes(payload.status))return json({error:'Only Approved or Published articles can be published.'},400,corsHeaders);
      const normalized={id:payload.id.trim(),status:'published',title:payload.title.trim(),slug:payload.slug.trim(),category:payload.category.trim(),author:payload.author.trim(),publishedAt:payload.publishedAt,updatedAt:payload.updatedAt,summary:payload.summary.trim(),tags:Array.isArray(payload.tags)?payload.tags.map(x=>String(x).trim()).filter(Boolean).slice(0,30):[],content:payload.content.trim()};
      if(data.items.some(x=>x.slug===normalized.slug&&x.id!==normalized.id))return json({error:'Another article already uses this slug.'},409,corsHeaders);const index=data.items.findIndex(x=>x.id===normalized.id);if(index>=0)data.items[index]={...data.items[index],...normalized};else data.items.push(normalized);message=index>=0?'Article updated and published.':'Article published.';
    }
    const updateResponse=await fetch(apiBase,{method:'PUT',headers:{...gh,'Content-Type':'application/json'},body:JSON.stringify({message:`${message} KKA Knowledge Centre`,content:b64(JSON.stringify({...data,version:1},null,2)+'\n'),sha:current.sha,branch:'main'})});
    const text=await updateResponse.text();if(!updateResponse.ok)return json({error:updateResponse.status===409?'GitHub data changed while saving. Refresh and try again.':'GitHub update failed.',githubStatus:updateResponse.status},502,corsHeaders);let result={};try{result=JSON.parse(text)}catch{}
    return json({success:true,message,commit:result.commit?.sha||null},200,{...corsHeaders,'Cache-Control':'no-store'});
  }
  if(url.pathname==='/logout')return redirect(`${origin}${adminPath}`,{'Set-Cookie':cookie('kka_session','',0,'ca-kka.com')});
  return json({service:'KKA Knowledge Centre Google Authentication',status:'ok'},200,corsHeaders);
}};