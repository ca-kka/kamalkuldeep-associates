/* KKA Client Portal — fast, non-blocking interaction feedback. */
(() => {
  const app = document.getElementById("app");
  if (!app) return;
  let bar = null;
  let timer = null;

  function ensureBar() {
    if (bar) return bar;
    bar = document.createElement("div");
    bar.className = "kka-client-progress";
    bar.setAttribute("role", "status");
    bar.setAttribute("aria-live", "polite");
    bar.innerHTML = '<span class="kka-client-progress-track"><i></i></span><span class="kka-client-progress-label">Processing…</span>';
    document.body.appendChild(bar);
    return bar;
  }

  function stop() {
    clearTimeout(timer);
    if (bar) bar.classList.remove("is-active");
  }

  function start(message = "Processing…", duration = 650) {
    const el = ensureBar();
    el.querySelector(".kka-client-progress-label").textContent = message;
    el.classList.add("is-active");
    clearTimeout(timer);
    timer = setTimeout(stop, duration);
  }

  document.addEventListener("click", event => {
    const target = event.target.closest?.("button, a[data-view]");
    if (!target || target.matches(".modal-close,[data-profile-action='signout']")) return;
    if (target.matches("a[data-view]")) {
      start("Opening…", 700);
    } else if (target.matches("button:not(.mobile-menu-toggle)")) {
      const text = (target.textContent || "").trim();
      if (text && !target.disabled) start(`${text.replace(/\s+/g, " ").slice(0, 28)}…`, 650);
    }
  }, true);

  window.KKAClientPortalFeedback = { start, stop };
})();
