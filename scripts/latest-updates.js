(function () {
  'use strict';

  const DATA_URL = 'data/latest-updates.json';
  const SECTION_ID = 'latest-updates';

  function updateFooterDate() {
    const formatter = new Intl.DateTimeFormat('en-IN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'Asia/Kolkata'
    });
    const today = formatter.format(new Date());
    document.querySelectorAll('.footer-bottom p').forEach(function (p) {
      if (/Last Updated\s*:/i.test(p.textContent)) {
        p.textContent = `Last Updated: ${today}`;
      }
    });
  }

  function updateDueDateStatuses() {
    const formatter = new Intl.DateTimeFormat('en-IN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'Asia/Kolkata'
    });
    const parts = formatter.formatToParts(new Date());
    const today = `${parts.find(p => p.type === 'year').value}-${parts.find(p => p.type === 'month').value}-${parts.find(p => p.type === 'day').value}`;

    document.querySelectorAll('.due-date-card').forEach(function (card) {
      const dateElement = card.querySelector('.date');
      if (!dateElement) return;

      // Use the first full date when a deadline contains alternatives such as
      // "22 October 2026 / 24 October 2026".
      const match = dateElement.textContent.trim().match(/\b(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\b/);
      if (!match) return;

      const months = {
        january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
        july: '07', august: '08', september: '09', october: '10', november: '11', december: '12'
      };
      const month = months[match[2].toLowerCase()];
      if (!month) return;
      const dueDate = `${match[3]}-${month}-${String(match[1]).padStart(2, '0')}`;

      let notice = card.querySelector('.urgent-notice');
      const title = card.querySelector('h4')?.textContent.trim() || 'Due date';
      const isToday = dueDate === today;
      const isOverdue = dueDate < today;

      if (isToday || isOverdue) {
        if (!notice) {
          notice = document.createElement('div');
          notice.className = 'urgent-notice';
          notice.style.marginTop = '0.75rem';
          notice.style.padding = '0.6rem';
          const strong = document.createElement('strong');
          notice.appendChild(strong);
          card.appendChild(notice);
        }
        const strong = notice.querySelector('strong') || notice;
        strong.textContent = isToday ? '⚠️ Due Today' : '⚠️ Overdue';
        card.setAttribute('data-due-status', isToday ? 'today' : 'overdue');
        card.setAttribute('aria-label', `${title}: ${isToday ? 'Due Today' : 'Overdue'}`);
      }
    });
  }

  function injectStyles() {
    if (document.getElementById('latest-updates-styles')) return;
    const style = document.createElement('style');
    style.id = 'latest-updates-styles';
    style.textContent = `
      #${SECTION_ID} { scroll-margin-top: 90px; margin: 2.5rem 0 2rem; }
      .latest-updates-panel { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; box-shadow: 0 3px 12px rgba(0,0,0,.06); overflow: hidden; }
      .latest-updates-heading { display:flex; align-items:center; gap:.65rem; padding:.85rem 1.15rem; background:#f8fafc; border-bottom:1px solid #e5e7eb; color:#1e3c72; font-size:.98rem; font-weight:700; letter-spacing:.04em; }
      .latest-updates-dot { width:8px; height:8px; border-radius:50%; background:#f59e0b; flex:0 0 auto; }
      .latest-updates-window { overflow:hidden; position:relative; }
      .latest-updates-track { display:flex; width:max-content; min-width:100%; animation: latestUpdatesScroll 55s linear infinite; }
      .latest-updates-track:hover, .latest-updates-window:focus-within .latest-updates-track { animation-play-state:paused; }
      .latest-update-link { display:inline-flex; align-items:center; gap:.55rem; padding:.9rem 1.2rem; color:#2a5298; text-decoration:none; font-size:.94rem; white-space:nowrap; border-right:1px solid #eef2f7; }
      .latest-update-link::after { content:'↗'; font-size:.8rem; opacity:.7; }
      .latest-update-link:hover { color:#1e3c72; background:#f8fafc; }
      .latest-update-source { display:inline-flex; align-items:center; padding:.16rem .48rem; border:1px solid #dbe5f1; border-radius:999px; background:#f8fafc; color:#667085; font-size:.68rem; font-weight:700; letter-spacing:.02em; flex:0 0 auto; }
      .latest-updates-disclaimer { margin:.65rem 1rem 0; color:#6b7280; font-size:.76rem; line-height:1.5; text-align:center; }
      @keyframes latestUpdatesScroll { from { transform:translateX(0); } to { transform:translateX(-50%); } }
      @media (prefers-reduced-motion: reduce) { .latest-updates-track { animation:none; width:100%; flex-wrap:wrap; } .latest-update-link { white-space:normal; } }
      @media (max-width:768px) { #${SECTION_ID} { margin:2rem 0 1.5rem; } .latest-updates-heading { font-size:.9rem; } .latest-update-link { font-size:.86rem; padding:.8rem 1rem; } .latest-update-source { font-size:.62rem; } .latest-updates-disclaimer { font-size:.72rem; } }
    `;
    document.head.appendChild(style);
  }

  function buildTicker(items) {
    const section = document.getElementById(SECTION_ID);
    if (!section) return;
    const track = section.querySelector('.latest-updates-track');
    if (!track) return;

    const safeItems = Array.isArray(items) ? items.filter(item => item && item.title && item.url) : [];
    if (!safeItems.length) {
      section.hidden = true;
      return;
    }

    const makeLink = item => {
      const a = document.createElement('a');
      a.className = 'latest-update-link';
      a.href = item.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';

      const title = document.createElement('span');
      title.textContent = item.title;
      a.appendChild(title);

      if (item.source) {
        const source = document.createElement('span');
        source.className = 'latest-update-source';
        source.textContent = item.source;
        a.appendChild(source);
      }

      a.setAttribute('aria-label', `${item.title} — ${item.source || 'Official source'}`);
      return a;
    };

    track.replaceChildren();
    safeItems.slice(0, 12).forEach(item => track.appendChild(makeLink(item)));
    safeItems.slice(0, 12).forEach(item => track.appendChild(makeLink(item)));
  }

  function addFallbackAnchorBehaviour() {
    const link = document.querySelector('a[href="#latest-updates"]');
    if (!link) return;
    link.addEventListener('click', function () {
      const section = document.getElementById(SECTION_ID);
      if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function addClientPortalEntry() {
    const nav = document.querySelector('.nav ul');
    if (!nav || nav.querySelector('[data-client-portal-preview]')) return;

    const item = document.createElement('li');
    item.setAttribute('data-client-portal-preview', 'true');
    const link = document.createElement('a');
    link.href = 'client-portal.html';
    link.className = 'client-portal-login';
    link.textContent = 'Client Login';
    link.setAttribute('aria-label', 'KKA Client Portal — Coming Soon');
    item.appendChild(link);
    nav.appendChild(item);

    if (!document.getElementById('client-portal-nav-styles')) {
      const style = document.createElement('style');
      style.id = 'client-portal-nav-styles';
      style.textContent = `
        .nav .client-portal-login{position:relative;background:linear-gradient(135deg,#071522,#163445);color:#f0d99a!important;border:1px solid rgba(214,181,107,.42);border-radius:6px;padding:.5rem 1.25rem!important;font-weight:700;box-shadow:0 3px 12px rgba(7,21,34,.16);transition:all .25s ease}
        .nav .client-portal-login::before{content:'✦';margin-right:7px;font-size:.72rem;color:#f0d99a}
        .nav .client-portal-login:hover{background:linear-gradient(135deg,#10283a,#1c465b)!important;color:#fff4cf!important;border-color:rgba(240,217,154,.72);transform:translateY(-1px);box-shadow:0 5px 16px rgba(7,21,34,.24)}
        @media(max-width:768px){.nav .client-portal-login{border-radius:0;border-left:3px solid #d6b56b;padding:1rem 1.5rem!important}}
      `;
      document.head.appendChild(style);
    }
  }

  function addLegalFooterLinks() {
    const footerBottom = document.querySelector('.footer-bottom');
    if (!footerBottom || footerBottom.querySelector('[data-kka-legal-links]')) return;

    const legal = document.createElement('div');
    legal.setAttribute('data-kka-legal-links', 'true');
    legal.className = 'kka-legal-links';
    legal.innerHTML = `
      <a href="privacy-policy.html">Privacy Policy</a>
      <span aria-hidden="true">|</span>
      <a href="terms-of-use.html">Terms of Use</a>
      <span aria-hidden="true">|</span>
      <a href="disclaimer.html">Disclaimer</a>
    `;
    footerBottom.appendChild(legal);

    if (!document.getElementById('kka-legal-links-styles')) {
      const style = document.createElement('style');
      style.id = 'kka-legal-links-styles';
      style.textContent = `
        .kka-legal-links{display:flex;justify-content:center;align-items:center;gap:.55rem;flex-wrap:wrap;margin-top:.7rem;font-size:.84rem}
        .kka-legal-links a{color:inherit;text-decoration:underline;text-underline-offset:2px;opacity:.9}
        .kka-legal-links a:hover{opacity:1}
      `;
      document.head.appendChild(style);
    }
  }

  async function init() {
    updateFooterDate();
    injectStyles();
    addFallbackAnchorBehaviour();
    addClientPortalEntry();
    addLegalFooterLinks();
    updateDueDateStatuses();

    const adminLogin = document.querySelector('.admin-login');
    if (adminLogin) adminLogin.href = 'https://files.ca-kka.com/';

    try {
      const response = await fetch(DATA_URL, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      buildTicker(data.items);
    } catch (error) {
      const section = document.getElementById(SECTION_ID);
      if (section) section.hidden = true;
      console.warn('Latest Updates unavailable; section hidden.', error);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
