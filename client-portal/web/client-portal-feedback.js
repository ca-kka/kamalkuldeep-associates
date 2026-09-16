/* KKA Client Portal — independent shell feedback and interaction state. */
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

  function start(message = "Processing…") {
    const el = ensureBar();
    el.querySelector(".kka-client-progress-label").textContent = message;
    el.classList.add("is-active");
    clearTimeout(timer);
    timer = setTimeout(() => stop(), 1200);
  }

  function stop() {
    if (!bar) return;
    bar.classList.remove("is-active");
  }

  function wire() {
    const form = document.querySelector("#login-form");
    if (form && !form.dataset.feedbackBound) {
      form.dataset.feedbackBound = "1";
      form.addEventListener("submit", () => start("Signing in securely…"), true);
    }

    document.addEventListener("click", event => {
      const target = event.target.closest?.("button, a[data-view]");
      if (!target || target.matches(".modal-close,[data-profile-action='signout']")) return;
      if (target.matches("a[data-view]")) start("Opening…");
      else if (target.matches("button:not(.mobile-menu-toggle)")) {
        const text = (target.textContent || "").trim();
        if (text) start(`${text.replace(/\s+/g, " ").slice(0, 32)}…`);
      }
    }, true);

    const observer = new MutationObserver(() => {
      if (document.querySelector(".portal-shell")) stop();
      wire();
    });
    observer.observe(app, { childList: true, subtree: true });
  }

  wire();
  window.KKAClientPortalFeedback = { start, stop };
})();
