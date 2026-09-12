const enc = new TextEncoder();
const dec = new TextDecoder();

function b64u(input) {
  const bytes = typeof input === 'string' ? enc.encode(input) : input;
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function b64(input) {
  const bytes = typeof input === 'string' ? enc.encode(input) : input;
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function unb64u(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function unb64(s) {
  return dec.decode(Uint8Array.from(atob(s.replace(/\n/g, '')), c => c.charCodeAt(0)));
}
async function key(secret) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
async function sign(value, secret) {
  const sig = await crypto.subtle.sign('HMAC', await key(secret), enc.encode(value));
  return `${value}.${b64u(new Uint8Array(sig))}`;
}
async function verify(value, secret) {
  if (!value) return null;
  const p = value.lastIndexOf('.');
  if (p < 1) return null;
  try {
    return await crypto.subtle.verify('HMAC', await key(secret), unb64u(value.slice(p + 1)), enc.encode(value.slice(0, p))) ? value.slice(0, p) : null;
  } catch { return null; }
}
function cookie(name, value, maxAge, domain = '') {
  return `${name}=${value}; Path=/; Max-Age=${maxAge}${domain ? `; Domain=${domain}` : ''}; HttpOnly; Secure; SameSite=Lax`;
}
function redirect(url, headers = {}) {
  const h = new Headers({ Location: url });
  for (const [n, v] of Object.entries(headers)) {
    if (n.toLowerCase() === 'set-cookie' && Array.isArray(v)) v.forEach(x => h.append('Set-Cookie', x));
    else h.set(n, String(v));
  }
  return new Response(null, { status: 302, headers: h });
}
function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers } });
}
function b64json(o) { return b64u(JSON.stringify(o)); }
function getCookies(request, name) {
  const header = request.headers.get('Cookie') || '', values = [];
  const re = new RegExp('(?:^|;\\s*)' + name.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&') + '=([^;]*)', 'g');
  let m;
  while ((m = re.exec(header)) !== null) values.push(m[1]);
  return values;
}
async function authenticatedSession(request, secret, allowedEmail) {
  for (const token of getCookies(request, 'kka_session')) {
    const raw = await verify(token, secret);
    if (!raw) continue;
    try {
      const p = JSON.parse(dec.decode(unb64u(raw)));
      if (p.exp && Date.now() <= p.exp && p.email === allowedEmail) return p;
    } catch {}
  }
  return null;
}
function validDate(v) { return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v); }
function validSlug(v) { return typeof v === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v) && v.length <= 120; }
function cleanTags(tags) {
  return Array.isArray(tags) ? tags.map(x => String(x).trim()).filter(Boolean).slice(0, 30) : [];
}

const publishers = ['CA Kamal Jain', 'CA Hitesh Jain'];
const required = ['id', 'title', 'slug', 'category', 'author', 'summary'];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = env.PUBLIC_ORIGIN || 'https://ca-kka.com';
    const adminPath = '/knowledge/admin/';
    const allowedEmail = (env.ADMIN_EMAIL || '').trim().toLowerCase();
    const secret = env.SESSION_SECRET || '';
    const githubToken = env.GITHUB_PUBLISH_TOKEN || '';
    const repo = 'ca-kka/kamalkuldeep-associates';
    const dataPath = 'knowledge/data/articles.json';
    const requestOrigin = request.headers.get('Origin') || '';
    const corsOrigin = ['https://ca-kka.com', 'https://www.ca-kka.com'].includes(requestOrigin) ? requestOrigin : 'https://ca-kka.com';
    const cors = {
      'Access-Control-Allow-Origin': corsOrigin,
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin'
    };

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.REDIRECT_URI || !allowedEmail || !secret) {
      return json({ error: 'Authentication service is not configured.' }, 503, cors);
    }
    if (url.pathname === '/config') return json({ clientId: env.GOOGLE_CLIENT_ID, redirectUri: env.REDIRECT_URI, adminPath }, 200, { ...cors, 'Cache-Control': 'no-store' });

    if (url.pathname === '/login') {
      const state = await sign(b64json({ n: crypto.randomUUID(), t: Date.now() }), secret);
      const g = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      g.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
      g.searchParams.set('redirect_uri', env.REDIRECT_URI);
      g.searchParams.set('response_type', 'code');
      g.searchParams.set('scope', 'openid email profile');
      g.searchParams.set('state', state);
      g.searchParams.set('prompt', 'select_account');
      return redirect(g.toString(), { 'Set-Cookie': cookie('kka_oauth_state', state, 600) });
    }

    if (url.pathname === '/callback') {
      const returned = url.searchParams.get('state') || '';
      const expected = getCookies(request, 'kka_oauth_state')[0] || '';
      const verified = await verify(returned, secret);
      if (!returned || returned !== expected || !verified) return json({ error: 'Invalid OAuth state.' }, 400);
      const code = url.searchParams.get('code');
      if (!code) return json({ error: 'Google did not return an authorization code.' }, 400);
      const tr = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: env.REDIRECT_URI, grant_type: 'authorization_code' })
      });
      if (!tr.ok) return json({ error: 'Google token exchange failed.' }, 502);
      const tokens = await tr.json();
      if (!tokens.access_token) return json({ error: 'Google did not provide an access token.' }, 502);
      const ur = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${tokens.access_token}` } });
      if (!ur.ok) return json({ error: 'Google profile lookup failed.' }, 502);
      const user = await ur.json();
      if (!user.email || user.email.toLowerCase() !== allowedEmail || user.email_verified !== true) {
        return redirect(`${origin}${adminPath}?error=not-authorized`, { 'Set-Cookie': [cookie('kka_session', '', 0, 'ca-kka.com'), cookie('kka_session', '', 0)] });
      }
      const sp = b64json({ email: user.email.toLowerCase(), name: user.name || '', picture: user.picture || '', exp: Date.now() + 8 * 60 * 60 * 1000 });
      const session = await sign(sp, secret);
      return redirect(`${origin}${adminPath}?login=success`, { 'Set-Cookie': [cookie('kka_session', session, 8 * 60 * 60, 'ca-kka.com'), cookie('kka_session', '', 0), cookie('kka_oauth_state', '', 0)] });
    }

    const session = await authenticatedSession(request, secret, allowedEmail);
    if (url.pathname === '/session') {
      if (!session) return json({ authenticated: false }, 401, { ...cors, 'Cache-Control': 'no-store' });
      return json({ authenticated: true, user: { email: session.email, name: session.name, picture: session.picture } }, 200, { ...cors, 'Cache-Control': 'no-store' });
    }

    const gh = {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${githubToken}`,
      'X-GitHub-Api-Version': '2026-03-10',
      'User-Agent': 'KKA-Knowledge-Centre-Publisher'
    };
    const api = `https://api.github.com/repos/${repo}/contents/${dataPath}`;

    if (url.pathname === '/articles' && request.method === 'GET') {
      if (!session) return json({ error: 'Authentication required.' }, 401, cors);
      const r = await fetch(`${api}?ref=main`, { headers: gh });
      if (!r.ok) return json({ error: 'Could not read Knowledge Centre data from GitHub.' }, 502, cors);
      const cur = await r.json();
      try { return json({ items: JSON.parse(unb64(cur.content || '')).items || [] }, 200, { ...cors, 'Cache-Control': 'no-store' }); }
      catch { return json({ error: 'Existing Knowledge Centre data is not valid JSON.' }, 502, cors); }
    }

    if (url.pathname === '/upload-image' && request.method === 'POST') {
      if (!session) return json({ error: 'Authentication required.' }, 401, cors);
      let p; try { p = await request.json(); } catch { return json({ error: 'Invalid JSON payload.' }, 400, cors); }
      const mime = String(p.mime || ''), dataUrl = String(p.dataUrl || ''), name = String(p.filename || 'image').replace(/[^a-zA-Z0-9._-]/g, '-');
      if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(mime) || !dataUrl.startsWith(`data:${mime};base64,`)) return json({ error: 'Unsupported image.' }, 400, cors);
      const raw = dataUrl.split(',')[1] || '';
      if (raw.length > 7 * 1024 * 1024) return json({ error: 'Image is too large.' }, 413, cors);
      const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }[mime];
      const safeBase = name.replace(/\.[^.]+$/, '').slice(0, 80) || 'image';
      const path = `knowledge/images/articles/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${safeBase}.${ext}`;
      const imageApi = `https://api.github.com/repos/${repo}/contents/${path}`;
      const r = await fetch(imageApi, { method: 'PUT', headers: { ...gh, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Add Knowledge Centre article image', content: raw, branch: 'main' }) });
      if (!r.ok) return json({ error: 'GitHub image upload failed.', githubStatus: r.status }, 502, cors);
      return json({ success: true, url: `https://ca-kka.com/${path}` }, 200, { ...cors, 'Cache-Control': 'no-store' });
    }

    if ((url.pathname === '/draft' || url.pathname === '/publish' || url.pathname === '/manage') && request.method === 'POST') {
      if (!session) return json({ error: 'Authentication required.' }, 401, cors);
      let p; try { p = await request.json(); } catch { return json({ error: 'Invalid JSON payload.' }, 400, cors); }
      const r = await fetch(`${api}?ref=main`, { headers: gh });
      if (!r.ok) return json({ error: 'Could not read Knowledge Centre data from GitHub.' }, 502, cors);
      const current = await r.json();
      let data; try { data = JSON.parse(unb64(current.content || '')); } catch { return json({ error: 'Existing Knowledge Centre data is not valid JSON.' }, 502, cors); }
      if (!Array.isArray(data.items)) data.items = [];
      let message = '';

      if (url.pathname === '/draft') {
        const now = new Date().toISOString().slice(0, 10);
        const id = typeof p.id === 'string' && p.id.trim() ? p.id.trim() : `kc-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
        const title = typeof p.title === 'string' ? p.title.trim() : '';
        const slug = typeof p.slug === 'string' ? p.slug.trim() : '';
        if (slug && !validSlug(slug)) return json({ error: 'Invalid slug. Use lowercase letters, numbers and hyphens only.' }, 400, cors);
        if (slug && data.items.some(x => x.slug === slug && x.id !== id)) return json({ error: 'Another article already uses this slug.' }, 409, cors);
        const draft = {
          id, status: 'draft', title, slug, category: typeof p.category === 'string' && p.category.trim() ? p.category.trim() : 'GST',
          author: publishers.includes(p.author) ? p.author : 'CA Kamal Jain', publishedAt: validDate(p.publishedAt) ? p.publishedAt : '',
          updatedAt: now, summary: typeof p.summary === 'string' ? p.summary.trim() : '', tags: cleanTags(p.tags),
          contentHtml: typeof p.contentHtml === 'string' ? p.contentHtml.trim() : ''
        };
        const i = data.items.findIndex(x => x.id === id);
        if (i >= 0) data.items[i] = { ...data.items[i], ...draft };
        else data.items.push(draft);
        message = i >= 0 ? 'Draft saved.' : 'Draft created.';
      } else if (url.pathname === '/manage') {
        const action = p.action, id = typeof p.id === 'string' ? p.id.trim() : '';
        const i = data.items.findIndex(x => x.id === id);
        if (i < 0) return json({ error: 'Article not found.' }, 404, cors);
        if (action === 'unpublish') {
          data.items[i] = { ...data.items[i], status: 'draft', updatedAt: new Date().toISOString().slice(0, 10) };
          message = 'Article unpublished and kept as a draft.';
        } else if (action === 'delete') {
          data.items.splice(i, 1); message = 'Article permanently deleted.';
        } else return json({ error: 'Unsupported management action.' }, 400, cors);
      } else {
        if (required.some(k => typeof p[k] !== 'string' || !p[k].trim())) return json({ error: 'Article is missing a required field.' }, 400, cors);
        if (!publishers.includes(p.author)) return json({ error: 'Select an approved KKA publisher.' }, 400, cors);
        if (!validSlug(p.slug) || !validDate(p.publishedAt) || !validDate(p.updatedAt)) return json({ error: 'Invalid slug or dates.' }, 400, cors);
        if (!['approved', 'published'].includes(p.status)) return json({ error: 'Only Approved or Published articles can be published.' }, 400, cors);
        if (typeof p.contentHtml !== 'string' || !p.contentHtml.trim()) return json({ error: 'Article content is required.' }, 400, cors);
        const normalized = {
          id: p.id.trim(), status: 'published', title: p.title.trim(), slug: p.slug.trim(), category: p.category.trim(), author: p.author,
          publishedAt: p.publishedAt, updatedAt: p.updatedAt, summary: p.summary.trim(), tags: cleanTags(p.tags), contentHtml: p.contentHtml.trim()
        };
        if (data.items.some(x => x.slug === normalized.slug && x.id !== normalized.id)) return json({ error: 'Another article already uses this slug.' }, 409, cors);
        const i = data.items.findIndex(x => x.id === normalized.id);
        if (i >= 0) data.items[i] = { ...data.items[i], ...normalized }; else data.items.push(normalized);
        message = i >= 0 ? 'Article updated and published.' : 'Article published.';
      }

      const ur = await fetch(api, {
        method: 'PUT', headers: { ...gh, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `${message} KKA Knowledge Centre`, content: b64(JSON.stringify({ ...data, version: 1 }, null, 2) + '\n'), sha: current.sha, branch: 'main' })
      });
      if (!ur.ok) return json({ error: 'GitHub update failed.', githubStatus: ur.status }, 502, cors);
      const saved = url.pathname === '/draft' ? data.items.find(x => x.id === (typeof p.id === 'string' && p.id.trim() ? p.id.trim() : data.items[data.items.length - 1]?.id)) : null;
      return json({ success: true, message, article: saved || undefined }, 200, { ...cors, 'Cache-Control': 'no-store' });
    }

    if (url.pathname === '/logout') return redirect(`${origin}${adminPath}`, { 'Set-Cookie': [cookie('kka_session', '', 0, 'ca-kka.com'), cookie('kka_session', '', 0)] });
    return json({ service: 'KKA Knowledge Centre Google Authentication', status: 'ok' }, 200, cors);
  }
};
