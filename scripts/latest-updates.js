(function () {
  'use strict';

  const DATA_URL = 'data/latest-updates.json';
  const SECTION_ID = 'latest-updates';

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
      .latest-update-link { display:inline-flex; align-items:center; gap:.45rem; padding:.9rem 1.2rem; color:#2a5298; text-decoration:none; font-size:.94rem; white-space:nowrap; border-right:1px solid #eef2f7; }
      .latest-update-link::after { content:'↗'; font-size:.8rem; opacity:.7; }
      .latest-update-link:hover { color:#1e3c72; background:#f8fafc; }
      .latest-updates-disclaimer { margin:.65rem 1rem 0; color:#6b7280; font-size:.76rem; line-height:1.5; text-align:center; }
      @keyframes latestUpdatesScroll { from { transform:translateX(0); } to { transform:translateX(-50%); } }
      @media (prefers-reduced-motion: reduce) { .latest-updates-track { animation:none; width:100%; flex-wrap:wrap; } .latest-update-link { white-space:normal; } }
      @media (max-width:768px) { #${SECTION_ID} { margin:2rem 0 1.5rem; } .latest-updates-heading { font-size:.9rem; } .latest-update-link { font-size:.86rem; padding:.8rem 1rem; } .latest-updates-disclaimer { font-size:.72rem; } }
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
      a.textContent = item.title;
      a.setAttribute('aria-label', `${item.title} — ${item.source || 'Official source'}`);
      return a;
    };

    track.replaceChildren();
    safeItems.slice(0, 8).forEach(item => track.appendChild(makeLink(item)));
    safeItems.slice(0, 8).forEach(item => track.appendChild(makeLink(item)));
  }

  function addFallbackAnchorBehaviour() {
    const link = document.querySelector('a[href="#latest-updates"]');
    if (!link) return;
    link.addEventListener('click', function () {
      const section = document.getElementById(SECTION_ID);
      if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  async function init() {
    injectStyles();
    addFallbackAnchorBehaviour();
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
