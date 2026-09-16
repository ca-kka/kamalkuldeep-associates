/* KKA Client Portal mobile navigation.
 * Desktop navigation remains untouched. On narrow screens this adds a compact
 * hamburger control and turns the existing sidebar navigation into a drawer.
 */
const app = document.querySelector('#app');

function setupMobileMenu() {
  const shell = document.querySelector('.portal-shell');
  const sidebar = shell?.querySelector('.sidebar');
  const nav = sidebar?.querySelector('nav[aria-label="Portal navigation"]');
  if (!shell || !sidebar || !nav || shell.querySelector('.mobile-menu-toggle')) return;

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'mobile-menu-toggle';
  toggle.setAttribute('aria-label', 'Open navigation menu');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.innerHTML = '<span></span><span></span><span></span>';

  const backdrop = document.createElement('button');
  backdrop.type = 'button';
  backdrop.className = 'mobile-menu-backdrop';
  backdrop.setAttribute('aria-label', 'Close navigation menu');
  backdrop.tabIndex = -1;

  const close = () => {
    shell.classList.remove('mobile-menu-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open navigation menu');
  };
  const open = () => {
    shell.classList.add('mobile-menu-open');
    toggle.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-label', 'Close navigation menu');
  };

  toggle.addEventListener('click', () => {
    shell.classList.contains('mobile-menu-open') ? close() : open();
  });
  backdrop.addEventListener('click', close);
  nav.addEventListener('click', (event) => {
    if (event.target.closest('a')) close();
  });
  window.addEventListener('resize', () => {
    if (window.innerWidth > 760) close();
  });

  shell.append(toggle, backdrop);
}

if (app) {
  const observer = new MutationObserver(setupMobileMenu);
  observer.observe(app, { childList: true, subtree: true });
  setupMobileMenu();
}
