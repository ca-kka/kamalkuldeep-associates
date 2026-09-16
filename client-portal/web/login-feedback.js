/* KKA authentication gateway — visible processing state for sign-in and OTP flows. */
(() => {
  const app = document.getElementById("app");
  if (!app) return;
  let overlay = null;

  function show(message = "Please wait…") {
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.className = "kka-login-processing";
      overlay.setAttribute("role", "status");
      overlay.setAttribute("aria-live", "polite");
      overlay.innerHTML = '<div class="kka-login-processing-card"><span class="kka-login-spinner"></span><strong>KKA Secure Portal</strong><span class="kka-login-processing-text"></span></div>';
      document.body.appendChild(overlay);
    }
    overlay.querySelector(".kka-login-processing-text").textContent = message;
    overlay.classList.add("is-active");
  }

  function hide() { overlay?.classList.remove("is-active"); }

  function bind() {
    const form = document.querySelector("#login-form");
    if (form && !form.dataset.loginFeedbackBound) {
      form.dataset.loginFeedbackBound = "1";
      form.addEventListener("submit", () => show("Verifying your credentials…"), true);
    }
    const otp = document.querySelector("#otp-form");
    if (otp && !otp.dataset.loginFeedbackBound) {
      otp.dataset.loginFeedbackBound = "1";
      otp.addEventListener("submit", () => show("Verifying your KKA security code…"), true);
    }
  }

  new MutationObserver(() => { bind(); if (document.querySelector(".portal-shell")) hide(); }).observe(app, { childList: true, subtree: true });
  bind();
  window.KKALoginFeedback = { show, hide };
})();
