const KEY='kka-knowledge-admin-draft-v1';
const AUTH_BASE='https://auth.ca-kka.com';
const $=s=>document.querySelector(s);

async function requireAuth(){
  try{
    const r=await fetch(AUTH_BASE+'/session',{credentials:'include',cache:'no-store'});
    if(!r.ok)throw 0;
    const d=await r.json();
    if(!d.authenticated)throw 0;
    document.body.classList.add('authenticated');
    const bar=document.querySelector('.adminbar');
    if(bar&&!document.getElementById('logout-link')){
      const a=document.createElement('a');
      a.id='logout-link';
      a.className='secondary';
      a.href=AUTH_BASE+'/logout';
      a.textContent='Sign out';
      bar.appendChild(a);
    }
    return true;
  }catch(e){
    location.href='index.html?error=login-required';
    return false;
  }
}

function collectArticle(){
  return {
    id:$('#article-id')?.value.trim()||'',
    status:$('#article-status')?.value||'draft',
    title:$('#article-title')?.value.trim()||'',
    slug:$('#article-slug')?.value.trim()||'',
    category:$('#article-category')?.value||'GST',
    author:$('#article-author')?.value.trim()||'KKA',
    publishedAt:$('#article-published')?.value||'',
    updatedAt:$('#article-updated')?.value||'',
    summary:$('#article-summary')?.value.trim()||'',
    tags:($('#article-tags')?.value||'').split(',').map(x=>x.trim()).filter(Boolean),
    content:$('#article-content')?.value||''
  };
}

function saveDraft(){
  const data=collectArticle();
  localStorage.setItem(KEY,JSON.stringify(data));
  return data;
}

function loadDraft(){
  try{
    const d=JSON.parse(localStorage.getItem(KEY)||'null');
    if(!d)return;
    Object.entries(d).forEach(([k,v])=>{
      const el=$('#article-'+k);
      if(el)el.value=Array.isArray(v)?v.join(', '):v;
    });
  }catch(e){}
}

function updatePublishState(){
  const status=$('#article-status')?.value||'draft';
  const button=$('#publish');
  if(!button)return;
  const allowed=status==='approved'||status==='published';
  button.disabled=!allowed;
  button.title=allowed?'Publish this article to the live Knowledge Centre.':'Set status to Approved before publishing.';
}

function preview(){
  const d=saveDraft();
  const html=`<span class="tag">${escapeHtml(d.category)}</span><h1>${escapeHtml(d.title||'Untitled article')}</h1><p class="preview-meta">${escapeHtml(d.author)} · ${escapeHtml(d.updatedAt||d.publishedAt||'Draft')}</p><div class="preview-summary"><strong>Executive Summary</strong><p>${escapeHtml(d.summary)}</p></div><div class="preview-content">${escapeHtml(d.content).replace(/\n/g,'<br>')}</div>`;
  const w=window.open('about:blank','_blank');
  if(w){
    w.document.write('<!doctype html><title>KKA Preview</title><style>body{font-family:Segoe UI,Arial;max-width:850px;margin:50px auto;padding:20px;color:#172033;line-height:1.7}.tag{background:#edf3ff;color:#2a5298;padding:5px 10px;border-radius:20px;font-weight:700}.preview-summary{background:#f7f9fc;padding:18px;border-left:4px solid #1e3c72;margin:24px 0}.preview-meta{color:#68758a}</style>'+html);
    w.document.close();
  }
}

async function publishArticle(){
  const d=saveDraft();
  const status=$('#save-status');

  if(d.status!=='approved'&&d.status!=='published'){
    status.textContent='Set status to Approved before publishing.';
    return;
  }

  if(!d.id||!d.title||!d.slug||!d.author||!d.summary||!d.content||!d.publishedAt||!d.updatedAt){
    status.textContent='Complete the required article fields before publishing.';
    return;
  }

  if(!confirm(`Publish “${d.title}” to the live Knowledge Centre?`))return;

  const button=$('#publish');
  button.disabled=true;
  status.textContent='Publishing securely…';

  try{
    const response=await fetch(AUTH_BASE+'/publish',{
      method:'POST',
      credentials:'include',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(d)
    });

    const result=await response.json().catch(()=>({}));

    if(response.status===401){
      location.href='index.html?error=login-required';
      return;
    }

    if(!response.ok){
      status.textContent=result.error||'Publishing failed. Please try again.';
      return;
    }

    const published={...d,status:'published'};
    localStorage.setItem(KEY,JSON.stringify(published));
    $('#article-status').value='published';
    status.textContent='Published successfully. GitHub Pages will deploy the update shortly.';
  }catch(e){
    status.textContent='Publishing service could not be reached.';
  }finally{
    updatePublishState();
  }
}

function exportDraft(){
  const d=saveDraft();
  const blob=new Blob([JSON.stringify({version:1,items:[{...d}]},null,2)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=(d.slug||'kka-article')+'.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

function clearDraft(){
  localStorage.removeItem(KEY);
  location.reload();
}

function escapeHtml(v){
  return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

document.addEventListener('DOMContentLoaded',async()=>{
  if(!(await requireAuth()))return;

  loadDraft();
  updatePublishState();

  $('#save-draft')?.addEventListener('click',()=>{
    saveDraft();
    $('#save-status').textContent='Draft saved on this device.';
    updatePublishState();
  });

  $('#preview')?.addEventListener('click',preview);
  $('#publish')?.addEventListener('click',publishArticle);
  $('#export')?.addEventListener('click',exportDraft);
  $('#clear-draft')?.addEventListener('click',clearDraft);
  $('#article-status')?.addEventListener('change',updatePublishState);

  $('#article-title')?.addEventListener('input',()=>{
    if(!$('#article-slug').value){
      $('#article-slug').value=$('#article-title').value.toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
    }
  });
});
