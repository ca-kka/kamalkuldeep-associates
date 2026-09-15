(function(){
  function addLegalLinks(){
    const footer=document.querySelector('.main-footer-bottom');
    if(!footer || footer.querySelector('.kc-legal-links')) return;
    const nav=document.createElement('nav');
    nav.className='kc-legal-links';
    nav.setAttribute('aria-label','Legal links');
    nav.innerHTML='<a href="../privacy-policy.html">Privacy Policy</a><span aria-hidden="true">|</span><a href="../terms-of-use.html">Terms of Use</a><span aria-hidden="true">|</span><a href="../disclaimer.html">Disclaimer</a>';
    const updated=footer.querySelector('#kc-last-updated');
    if(updated) updated.insertAdjacentElement('afterend',nav); else footer.appendChild(nav);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',addLegalLinks); else addLegalLinks();
  setTimeout(addLegalLinks,500);
})();