const enc = new TextEncoder();

function b64u(input) {
  const bytes = typeof input === 'string' ? enc.encode(input) : input;
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function unb64u(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function key(secret) {
  return crypto.subtle.importKey('raw', enc.encode(secret), {name:'HMAC',hash:'SHA-256'}, false, ['sign','verify']);
}
async function sign(value, secret) {
  const sig = await crypto.subtle.sign('HMAC', await key(secret), enc.encode(value));
  return `${value}.${b64u(new Uint8Array(sig))}`;
}
async function verify(value, secret) {
  const p = value.lastIndexOf('.');
  if (p < 1) return null;
  const raw = value.slice(0,p), sig = value.slice(p+1);
  const ok = await crypto.subtle.verify('HMAC', await key(secret), unb64u(sig), enc.encode(raw));
  return ok ? raw : null;
}
function cookie(name, value, maxAge) {
  return `${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}
function redirect(url, headers = {}) { return new Response(null, {status:302, headers:{Location:url,...headers}}); }
function json(data, status=200, headers={}) { return new Response(JSON.stringify(data), {status, headers:{'Content-Type':'application/json; charset=utf-8', ...headers}}); }
function b64json(obj) { return b64u(JSON.stringify(obj)); }

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = env.PUBLIC_ORIGIN || 'https://ca-kka.com';
    const adminPath = '/knowledge/admin/';
    const allowedEmail = (env.ADMIN_EMAIL || '').trim().toLowerCase();
    const secret = env.SESSION_SECRET || '';
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.REDIRECT_URI || !allowedEmail || !secret) {
      return json({error:'Authentication service is not configured.'}, 503);
    }

    if (url.pathname === '/config') {
      return json({clientId:env.GOOGLE_CLIENT_ID, redirectUri:env.REDIRECT_URI, adminPath}, 200, {'Cache-Control':'no-store','Access-Control-Allow-Origin':origin});
    }

    if (url.pathname === '/login') {
      const stateData = b64json({n:crypto.randomUUID(), t:Date.now()});
      const state = await sign(stateData, secret);
      const google = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      google.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
      google.searchParams.set('redirect_uri', env.REDIRECT_URI);
      google.searchParams.set('response_type', 'code');
      google.searchParams.set('scope', 'openid email profile');
      google.searchParams.set('state', state);
      google.searchParams.set('prompt', 'select_account');
      return redirect(google.toString(), {'Set-Cookie':cookie('kka_oauth_state', state, 600)});
    }

    if (url.pathname === '/callback') {
      const returnedState = url.searchParams.get('state') || '';
      const cookies = request.headers.get('Cookie') || '';
      const expected = cookies.match(/(?:^|; )kka_oauth_state=([^;]+)/)?.[1] || '';
      const verifiedState = await verify(returnedState, secret);
      if (!returnedState || returnedState !== expected || !verifiedState) return json({error:'Invalid OAuth state.'}, 400);
      const code = url.searchParams.get('code');
      if (!code) return json({error:'Google did not return an authorization code.'}, 400);

      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:new URLSearchParams({code, client_id:env.GOOGLE_CLIENT_ID, client_secret:env.GOOGLE_CLIENT_SECRET, redirect_uri:env.REDIRECT_URI, grant_type:'authorization_code'})});
      if (!tokenResponse.ok) return json({error:'Google token exchange failed.'}, 502);
      const tokens = await tokenResponse.json();
      const userResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {headers:{Authorization:`Bearer ${tokens.access_token}`}});
      if (!userResponse.ok) return json({error:'Google profile lookup failed.'}, 502);
      const user = await userResponse.json();
      if (!user.email || user.email.toLowerCase() !== allowedEmail || user.email_verified !== true) {
        return redirect(`${origin}${adminPath}?error=not-authorized`, {'Set-Cookie':cookie('kka_session','',0)});
      }
      const sessionPayload = b64json({email:user.email.toLowerCase(), name:user.name || '', picture:user.picture || '', exp:Date.now()+8*60*60*1000});
      const session = await sign(sessionPayload, secret);
      return redirect(`${origin}${adminPath}?login=success`, {'Set-Cookie':[cookie('kka_session',session,8*60*60),cookie('kka_oauth_state','',0)].join(', ')});
    }

    if (url.pathname === '/session') {
      const cookies = request.headers.get('Cookie') || '';
      const token = cookies.match(/(?:^|; )kka_session=([^;]+)/)?.[1] || '';
      const raw = await verify(token, secret);
      if (!raw) return json({authenticated:false},401,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Credentials':'true'});
      let payload;
      try { payload=JSON.parse(new TextDecoder().decode(unb64u(raw))); } catch { return json({authenticated:false},401); }
      if (!payload.exp || Date.now() > payload.exp || payload.email !== allowedEmail) return json({authenticated:false},401);
      return json({authenticated:true,user:{email:payload.email,name:payload.name,picture:payload.picture}},200,{'Cache-Control':'no-store','Access-Control-Allow-Origin':origin,'Access-Control-Allow-Credentials':'true'});
    }

    if (url.pathname === '/logout') {
      return redirect(`${origin}${adminPath}`, {'Set-Cookie':cookie('kka_session','',0)});
    }

    return json({service:'KKA Knowledge Centre Google Authentication',status:'ok'});
  }
};
