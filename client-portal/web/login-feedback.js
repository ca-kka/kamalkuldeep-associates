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

  function show(message = "Processing…", duration = 700) {
    const el = ensureNotice();
    el.querySelector(".kka-login-processing-text").textContent = message;
    el.classList.add("is-active");
    clearTimeout(safetyTimer);
    safetyTimer = setTimeout(hide, duration);
  }

  function hide() {
    clearTimeout(safetyTimer);
    if (notice) notice.classList.remove("is-active");
  }

  // Do NOT attach a submit listener to #login-form. The OTP gate deliberately
  // intercepts that listener and stores the real application login handler.
  // Attaching another listener here would replace it and prevent login.
  document.addEventListener("click", event => {
    const target = event.target.closest?.("button");
    if (!target || target.disabled) return;

    if (target.matches("#login-form button[type='submit']")) {
      show("Verifying credentials…", 700);
      return;
    }
    if (target.matches("#kka-otp-verify")) {
      show("Verifying security code…", 700);
      return;
    }
    if (target.matches("#kka-otp-resend")) {
      show("Sending a new security code…", 700);
    }
  }, true);

  document.addEventListener("keydown", event => {
    if (event.key !== "Enter") return;
    const form = event.target.closest?.("#login-form");
    if (form) show("Verifying credentials…", 700);
  }, true);

  window.KKALoginFeedback = { show, hide };
})();
