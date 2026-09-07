const KEY='kka-knowledge-admin-draft-v1';
const AUTH_BASE='https://auth.ca-kka.com';
const $=s=>document.querySelector(s);

async function api(path,options={}){
  const r=await fetch(AUTH_BASE+path,{credentials:'include',cache:'no-store',...options});
  const d=await r.json().catch(()=>({}));
  if(r.status===401){location.href='index.html?error=login-required';throw new Error('Authentication required.');}
  if(!r.ok)throw new Error(d.error||'Request failed.');
  return d;
}

async function requireAuth(){
  try{
    const d=await api('/session');
    if(!d.authenticated)throw 0;
    document.body.classList.add('authenticated');
    const bar=document.querySelector('.adminbar');
    if(bar&&!document.getElementById('logout-link')){
      const a=document.createElement('a');a.id='logout-link';a.className='secondary';a.href=AUTH_BASE+'/logout';a.textContent='Sign out';bar.appendChild(a);
    }
    return true;
  }catch(e){
    if(e.message==='Authentication required.')return false;
    location.href='index.html?error=login-required';return false;
  }
}

function collectArticle(){
  return {id:$('#article-id')?.value.trim()||'',status:$('#article-status')?.value||'draft',title:$('#article-title')?.value.trim()||'',slug:$('#article-slug')?.value.trim()||'',category:$('#article-category')?.value||'GST',author:$('#article-author')?.value.trim()||'KKA',publishedAt:$('#article-published')?.value||'',updatedAt:$('#article-updated')?.value||'',summary:$('#article-summary')?.value.trim()||'',tags:($('#article-tags')?.value||'').split(',').map(x=>x.trim()).filter(Boolean),content:$('#article-content')?.value||''};
}

function fillArticle(d){
  ['id','status','title','slug','category','author','published','updated','summary','tags','content'].forEach(k=>{const el=$('#article-'+k);if(el)el.value=Array.isArray(d.tags)&&k==='tags'?d.tags.join(', '):(d[k]??'');});
  $('#editor-heading').textContent=d.id?'Edit Article':'New Article';
  $('#save-status').textContent=d.id?'Loaded from Knowledge Centre':'Local draft only';
  updatePublishState();
}

function newArticle(){
  localStorage.removeItem(KEY);
  fillArticle({id:'',status:'draft',title:'',slug:'',category:'GST',author:'KKA',publishedAt:'',updatedAt:'',summary:'',tags:[],content:''});
  window.scrollTo({top:document.querySelector('.editor-shell').offsetTop-20,behavior:'smooth'});
}

function saveDraft(){const data=collectArticle();localStorage.setItem(KEY,JSON.stringify(data));return data;}

function loadDraft(){try{const d=JSON.parse(localStorage.getItem(KEY)||'null');if(d)fillArticle(d);}catch(e){}}

function updatePublishState(){
  const status=$('#article-status')?.value||'draft',button=$('#publish');if(!button)return;
  const allowed=status==='approved'||status==='published';button.disabled=!allowed;button.title=allowed?'Publish this article to the live Knowledge Centre.':'Set status to Approved before publishing.';
}

function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

function preview(){
  const d=saveDraft();
  const html=`<span class="tag">${escapeHtml(d.category)}</span><h1>${escapeHtml(d.title||'Untitled article')}</h1><p class="preview-meta">${escapeHtml(d.author)} · ${escapeHtml(d.updatedAt||d.publishedAt||'Draft')}</p><div class="preview-summary"><strong>Executive Summary</strong><p>${escapeHtml(d.summary)}</p></div><div class="preview-content">${escapeHtml(d.content).replace(/\n/g,'<br>')}</div>`;
  const w=window.open('about:blank','_blank');if(w){w.document.write('<!doctype html><title>KKA Preview</title><style>body{font-family:Segoe UI,Arial;max-width:850px;margin:50px auto;padding:20px;color:#172033;line-height:1.7}.tag{background:#edf3ff;color:#2a5298;padding:5px 10px;border-radius:20px;font-weight:700}.preview-summary{background:#f7f9fc;padding:18px;border-left:4px solid #1e3c72;margin:24px 0}.preview-meta{color:#68758a}</style>'+html);w.document.close();}
}

async function publishArticle(){
  const d=saveDraft(),status=$('#save-status');
  if(d.status!=='approved'&&d.status!=='published'){status.textContent='Set status to Approved before publishing.';return;}
  if(!d.id||!d.title||!d.slug||!d.author||!d.summary||!d.content||!d.publishedAt||!d.updatedAt){status.textContent='Complete the required article fields before publishing.';return;}
  if(!confirm(`Publish “${d.title}” to the live Knowledge Centre?`))return;
  const button=$('#publish');button.disabled=true;status.textContent='Publishing securely…';
  try{await api('/publish',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});const published={...d,status:'published'};localStorage.setItem(KEY,JSON.stringify(published));$('#article-status').value='published';status.textContent='Published successfully. GitHub Pages will deploy the update shortly.';await loadArticles();}catch(e){status.textContent=e.message||'Publishing failed.';}finally{updatePublishState();}
}

async function loadArticles(){
  const box=$('#article-list');if(!box)return;box.innerHTML='<div class="empty-state">Loading articles…</div>';
  try{const d=await api('/articles');renderArticles(d.items||[]);}catch(e){box.innerHTML=`<div class="empty-state">${escapeHtml(e.message)}</div>`;}
}

function renderArticles(items){
  const box=$('#article-list'),q=($('#article-search')?.value||'').toLowerCase().trim(),filter=$('#article-filter')?.value||'all';
  const rows=items.filter(a=>(filter==='all'||a.status===filter)&&(!q||[a.title,a.slug,a.category,a.author,a.summary].join(' ').toLowerCase().includes(q)));
  if(!rows.length){box.innerHTML='<div class="empty-state">No articles found.</div>';return;}
  const table=document.createElement('table');table.className='article-table';table.innerHTML='<thead><tr><th>Article</th><th>Status</th><th>Category</th><th>Updated</th><th>Actions</th></tr></thead><tbody></tbody>';
  rows.forEach(a=>{
    const tr=document.createElement('tr');tr.innerHTML=`<td><div class="article-title">${escapeHtml(a.title||'Untitled')}</div><small>${escapeHtml(a.slug||'')}</small></td><td><span class="status-pill ${escapeHtml(a.status||'draft')}">${escapeHtml(a.status||'draft')}</span></td><td>${escapeHtml(a.category||'')}</td><td>${escapeHtml(a.updatedAt||a.publishedAt||'')}</td><td><div class="row-actions"><button class="secondary" data-action="edit">Edit</button><button class="secondary" data-action="preview">Preview</button>${a.status==='published'?'<button class="secondary" data-action="unpublish">Unpublish</button>':'<button class="primary" data-action="publish">Publish</button>'}<button class="danger" data-action="delete">Delete</button></div></td>`;
    tr.querySelectorAll('button').forEach(btn=>btn.addEventListener('click',()=>manageArticle(a,btn.dataset.action)));table.querySelector('tbody').appendChild(tr);
  });box.innerHTML='';box.appendChild(table);
}

async function manageArticle(article,action){
  if(action==='edit'){fillArticle(article);localStorage.setItem(KEY,JSON.stringify(article));window.scrollTo({top:document.querySelector('.editor-shell').offsetTop-20,behavior:'smooth'});return;}
  if(action==='preview'){const d=article;const w=window.open('about:blank','_blank');if(w){w.document.write('<!doctype html><title>KKA Preview</title><style>body{font-family:Segoe UI,Arial;max-width:850px;margin:50px auto;padding:20px;color:#172033;line-height:1.7}</style><h1>'+escapeHtml(d.title)+'</h1><p>'+escapeHtml(d.summary)+'</p><hr><div>'+escapeHtml(d.content).replace(/\n/g,'<br>')+'</div>');w.document.close();}return;}
  if(action==='unpublish'){
    if(!confirm(`Unpublish “${article.title}”? It will be removed from the public Knowledge Centre but kept in Admin as a draft.`))return;
  }
  if(action==='delete'){
    if(!confirm(`PERMANENTLY DELETE “${article.title}”?\n\nThis cannot be undone.`))return;
  }
  try{
    const d=await api('/manage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,id:article.id})});
    $('#save-status').textContent=d.message||'Change saved.';
    if(action==='delete'||action==='unpublish'){if(($('#article-id').value||'')===article.id)newArticle();}
    await loadArticles();
  }catch(e){alert(e.message||'Operation failed.');}
}

function exportDraft(){const d=saveDraft(),blob=new Blob([JSON.stringify({version:1,items:[{...d}]},null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=(d.slug||'kka-article')+'.json';a.click();URL.revokeObjectURL(a.href);}
function clearDraft(){localStorage.removeItem(KEY);newArticle();}

document.addEventListener('DOMContentLoaded',async()=>{
  if(!(await requireAuth()))return;
  loadDraft();updatePublishState();loadArticles();
  $('#save-draft')?.addEventListener('click',()=>{saveDraft();$('#save-status').textContent='Draft saved on this device.';updatePublishState();});
  $('#preview')?.addEventListener('click',preview);$('#publish')?.addEventListener('click',publishArticle);$('#export')?.addEventListener('click',exportDraft);$('#clear-draft')?.addEventListener('click',clearDraft);
  $('#new-article')?.addEventListener('click',newArticle);$('#refresh-articles')?.addEventListener('click',loadArticles);$('#article-search')?.addEventListener('input',loadArticles);$('#article-filter')?.addEventListener('change',loadArticles);$('#article-status')?.addEventListener('change',updatePublishState);
  $('#article-title')?.addEventListener('input',()=>{if(!$('#article-slug').value)$('#article-slug').value=$('#article-title').value.toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');});
});