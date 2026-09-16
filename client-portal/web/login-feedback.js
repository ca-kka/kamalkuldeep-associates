/* KKA authentication gateway — compact, non-blocking processing feedback. */
(() => {
  const app = document.getElementById("app");
  if (!app) return;

  let notice = null;
  let safetyTimer = null;

  function ensureNotice() {
    if (notice) return notice;
    notice = document.createElement("div");
    notice.className = "kka-login-processing";
    notice.setAttribute("role", "status");
    notice.setAttribute("aria-live", "polite");
    notice.innerHTML = '<div class="kka-login-processing-card"><span class="kka-login-spinner" aria-hidden="true"></span><span class="kka-login-processing-copy"><strong>KKA Secure Portal</strong><span class="kka-login-processing-text"></span></span></div>';
    document.body.appendChild(notice);
    return notice;
  }

  function show(message = "Processing…") {
    const el = ensureNotice();
    el.querySelector(".kka-login-processing-text").textContent = message;
    el.classList.add("is-active");
    clearTimeout(safetyTimer);
    safetyTimer = setTimeout(hide, 8000);
  }

  function hide() {
    clearTimeout(safetyTimer);
    if (notice) notice.classList.remove("is-active");
  }

  function bind() {
    const form = document.querySelector("#login-form");
    if (form && !form.dataset.loginFeedbackBound) {
      form.dataset.loginFeedbackBound = "1";
      form.addEventListener("submit", () => show("Verifying credentials…"), true);
    }

    const otp = document.querySelector("#otp-form");
    if (otp && !otp.dataset.loginFeedbackBound) {
      otp.dataset.loginFeedbackBound = "1";
      otp.addEventListener("submit", () => show("Verifying security code…"), true);
    }

    const message = document.querySelector("#auth-message");
    if (message && !message.dataset.loginFeedbackBound) {
      message.dataset.loginFeedbackBound = "1";
      new MutationObserver(() => {
        if ((message.textContent || "").trim()) hide();
      }).observe(message, { childList: true, characterData: true, subtree: true });
    }
  }

  const observer = new MutationObserver(() => {
    bind();
    if (document.querySelector(".portal-shell")) hide();
  });
  observer.observe(app, { childList: true, subtree: true });
  bind();

  window.KKALoginFeedback = { show, hide };
})();
