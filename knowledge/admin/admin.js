/* GitHub-native admin: authentication is provided by GitHub, not by client-side credentials. */
(function(){
  const links=[...document.querySelectorAll('a[href^="https://github.com/"]')];
  links.forEach(link=>link.addEventListener('click',()=>{link.setAttribute('rel','noopener');}));
})();
