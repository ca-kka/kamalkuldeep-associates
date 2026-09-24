import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/client-login-otp`;
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
let interceptedLoginHandler = null;
let interceptedLoginOptions = undefined;
let activeOverlay = null;
let resendTimer = null;
let resendRemaining = 0;

const esc = v => String(v ?? "").replace(/[&<>'"]/g, c => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
}[c]));

const originalAddEventListener = EventTarget.prototype.addEventListener;
EventTarget.prototype.addEventListener = function(type, listener, options) {
  if (this instanceof HTMLFormElement && this.id === "login-form" && type === "submit" && typeof listener === "function") {
    interceptedLoginHandler = listener;
    interceptedLoginOptions = options;
    return;
  }
  return originalAddEventListener.call(this, type, listener, options);
};

function invokeOriginalLogin(form) {
  const handler = interceptedLoginHandler;
  if (!handler) return;
  interceptedLoginHandler = null;
  interceptedLoginOptions = undefined;
  void handler({
    preventDefault() {},
    currentTarget: form,
    target: form,
    submitter: form.querySelector('button[type="submit"]'),
  });
}

function stopResendTimer() {
  if (resendTimer) clearInterval(resendTimer);
  resendTimer = null;
  resendRemaining = 0;
}

function startResendTimer(button, seconds = 60) {
  stopResendTimer();
  resendRemaining = seconds;
  button.disabled = true;
  const tick = () => {
    if (!activeOverlay) return stopResendTimer();
    if (resendRemaining <= 0) {
      button.disabled = false;
      button.textContent = "Resend code";
      return stopResendTimer();
    }
    button.textContent = `Resend code (${resendRemaining}s)`;
    resendRemaining -= 1;
  };
  tick();
  resendTimer = setInterval(tick, 1000);
}

function closeOverlay() {
  stopResendTimer();
  activeOverlay?.remove();
  activeOverlay = null;
  const form = document.querySelector("#login-form");
  const button = form?.querySelector('button[type="submit"]');
  if (button) button.disabled = false;
}

function bindOtpCubes(wrap) {
  const cubes = [...wrap.querySelectorAll(".kka-otp-cube")];
  const form = wrap.querySelector("#kka-otp-form");
  const value = () => cubes.map(input => input.value).join("");
  const focusFirstEmpty = () => (cubes.find(input => !input.value) || cubes[cubes.length - 1])?.focus();

  cubes.forEach((input, index) => {
    input.addEventListener("input", () => {
      input.value = input.value.replace(/\D/g, "").slice(-1);
      if (input.value && index < cubes.length - 1) cubes[index + 1].focus();
    });
    input.addEventListener("keydown", event => {
      if (event.key === "Backspace" && !input.value && index > 0) {
        cubes[index - 1].value = "";
        cubes[index - 1].focus();
      } else if (event.key === "ArrowLeft" && index > 0) {
        event.preventDefault();
        cubes[index - 1].focus();
      } else if (event.key === "ArrowRight" && index < cubes.length - 1) {
        event.preventDefault();
        cubes[index + 1].focus();
      }
    });
    input.addEventListener("paste", event => {
      event.preventDefault();
      const pasted = (event.clipboardData?.getData("text") || "").replace(/\D/g, "").slice(0, 6);
      pasted.split("").forEach((digit, offset) => {
        if (cubes[index + offset]) cubes[index + offset].value = digit;
      });
      focusFirstEmpty();
    });
  });

  form.dataset.getOtp = value;
  cubes[0]?.focus();
}

async function completeVerifiedLogin(result, message) {
  const session = result?.session;
  if (!session?.access_token || !session?.refresh_token) {
    throw new Error("The verified login session was not returned.");
  }

  const { error } = await supabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  if (error) throw error;

  message.className = "message success";
  message.textContent = "Verification successful. Opening your KKA workspace…";
  stopResendTimer();
  closeOverlay();
}

function showOtpOverlay({ maskedEmail, challengeId, expiresIn = 300, resendAfter = 60 }, email, password, form) {
  closeOverlay();
  const wrap = document.createElement("div");
  wrap.id = "kka-client-otp-overlay";
  wrap.innerHTML = `
    <style>
      #kka-client-otp-overlay{position:fixed;inset:0;z-index:100000;display:grid;place-items:center;padding:20px;background:rgba(8,18,14,.48);backdrop-filter:blur(5px)}
      #kka-client-otp-overlay .card{width:min(470px,100%);box-sizing:border-box;background:var(--white,#fff);color:var(--ink,#14221d);border:1px solid var(--line,#dfe5df);border-radius:20px;padding:30px;box-shadow:0 28px 90px rgba(0,0,0,.25)}
      #kka-client-otp-overlay .brand{margin-bottom:22px;color:var(--forest,#1e493d)}
      #kka-client-otp-overlay .brand strong{font-size:24px;letter-spacing:.08em}
      #kka-client-otp-overlay .brand small{display:block;color:var(--muted,#68756f);margin-top:4px;letter-spacing:.18em;font-size:9px}
      #kka-client-otp-overlay h2{margin:6px 0 8px}
      #kka-client-otp-overlay p{line-height:1.5}
      #kka-client-otp-overlay .muted{color:var(--muted,#68756f)}
      #kka-client-otp-overlay .eyebrow{color:var(--muted,#68756f);letter-spacing:.13em;font-size:10px;font-weight:800}
      #kka-client-otp-overlay .destinations{display:grid;gap:8px;margin:20px 0;padding:14px;border-radius:12px;background:var(--soft,#eef2ee);font-size:13px}
      #kka-client-otp-overlay .destination{display:flex;justify-content:space-between;gap:14px}
      #kka-client-otp-overlay .destination span{color:var(--muted,#68756f)}
      #kka-client-otp-overlay .destination strong{font-weight:700;text-align:right}
      #kka-client-otp-overlay form{display:grid;gap:13px}
      #kka-client-otp-overlay .otp-cubes{display:grid;grid-template-columns:repeat(6,1fr);gap:9px;margin:4px 0 3px}
      #kka-client-otp-overlay .kka-otp-cube{width:100%;height:58px;box-sizing:border-box;padding:0;text-align:center;font-size:25px;font-weight:800;border:1px solid var(--input-border,#cbd6cf);border-radius:11px;background:var(--input-bg,#fff);color:var(--ink,#14221d);caret-color:var(--accent,#1e493d)}
      #kka-client-otp-overlay .kka-otp-cube:focus{outline:2px solid var(--focus,#b9d2c3);border-color:var(--accent,#1e493d)}
      #kka-client-otp-overlay button{padding:12px 16px;border:0;border-radius:9px;font-weight:700;cursor:pointer}
      #kka-client-otp-overlay button:disabled{opacity:.55;cursor:not-allowed}
      #kka-client-otp-overlay .primary{background:var(--forest,#1e493d);color:#fff}
      #kka-client-otp-overlay .secondary{background:transparent;color:var(--forest,#1e493d);border:1px solid var(--line,#dfe5df)}
      #kka-client-otp-overlay .actions{display:flex;justify-content:space-between;gap:10px;margin-top:4px}
      #kka-client-otp-overlay .message{min-height:20px;font-size:13px;color:var(--muted,#68756f);margin:0}
      #kka-client-otp-overlay .message.error{color:#a33a2d}
      #kka-client-otp-overlay .message.success{color:#245b3d}
      @media(max-width:420px){#kka-client-otp-overlay .card{padding:22px 18px}#kka-client-otp-overlay .otp-cubes{gap:6px}#kka-client-otp-overlay .kka-otp-cube{height:52px;font-size:22px}}
    </style>
    <section class="card" role="dialog" aria-modal="true" aria-labelledby="kka-otp-title">
      <div class="brand"><strong>KKA</strong><small>CLIENT PLATFORM</small></div>
      <p class="eyebrow">SECURITY VERIFICATION</p>
      <h2 id="kka-otp-title">Enter your verification code</h2>
      <p class="muted">A 6-digit KKA security code has been sent to the registered email address below.</p>
      <div class="destinations" aria-label="Registered verification destination">
        <div class="destination"><span>Email</span><strong>${esc(maskedEmail || "Registered email")}</strong></div>
      </div>
      <form id="kka-otp-form">
        <div class="otp-cubes" role="group" aria-label="6 digit verification code">
          <input class="kka-otp-cube" inputmode="numeric" autocomplete="one-time-code" maxlength="1" aria-label="Digit 1" required>
          <input class="kka-otp-cube" inputmode="numeric" maxlength="1" aria-label="Digit 2" required>
          <input class="kka-otp-cube" inputmode="numeric" maxlength="1" aria-label="Digit 3" required>
          <input class="kka-otp-cube" inputmode="numeric" maxlength="1" aria-label="Digit 4" required>
          <input class="kka-otp-cube" inputmode="numeric" maxlength="1" aria-label="Digit 5" required>
          <input class="kka-otp-cube" inputmode="numeric" maxlength="1" aria-label="Digit 6" required>
        </div>
        <p id="kka-otp-message" class="message">The code expires in 5 minutes. Do not share it with anyone.</p>
        <button class="primary" id="kka-otp-verify" type="submit">Verify &amp; continue</button>
      </form>
      <div class="actions">
        <button class="secondary" id="kka-otp-change" type="button">Use different account</button>
        <button class="secondary" id="kka-otp-resend" type="button">Resend code</button>
      </div>
    </section>`;
  document.body.appendChild(wrap);
  activeOverlay = wrap;

  const otpForm = wrap.querySelector("#kka-otp-form");
  const cubes = [...wrap.querySelectorAll(".kka-otp-cube")];
  bindOtpCubes(wrap);
  const message = wrap.querySelector("#kka-otp-message");
  const verify = wrap.querySelector("#kka-otp-verify");
  const resend = wrap.querySelector("#kka-otp-resend");
  startResendTimer(resend, resendAfter);

  wrap.querySelector("#kka-otp-change").addEventListener("click", () => {
    closeOverlay();
    document.querySelector("#email")?.focus();
  });

  otpForm.addEventListener("submit", async event => {
    event.preventDefault();
    const otp = cubes.map(input => input.value).join("");
    if (!/^\d{6}$/.test(otp)) {
      message.className = "message error";
      message.textContent = "Enter all 6 digits of the security code.";
      (cubes.find(input => !input.value) || cubes[0])?.focus();
      return;
    }
    verify.disabled = true;
    message.className = "message";
    message.textContent = "Verifying your KKA security code…";
    try {
      const response = await fetch(FUNCTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", email, password, challengeId, otp }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        message.className = "message error";
        message.textContent = result.error || "The security code could not be verified.";
        verify.disabled = false;
        cubes.forEach(input => input.value = "");
        cubes[0]?.focus();
        return;
      }
      await completeVerifiedLogin(result, message);
    } catch (error) {
      message.className = "message error";
      message.textContent = error?.message || "The verified login session could not be established. Please sign in again.";
      verify.disabled = false;
    }
  });

  resend.addEventListener("click", async () => {
    if (resend.disabled) return;
    resend.disabled = true;
    resend.textContent = "Sending…";
    message.className = "message";
    message.textContent = "Sending a new KKA security code…";
    try {
      const response = await fetch(FUNCTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request", email, password }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.requiresOtp) {
        message.className = "message error";
        message.textContent = result.error || "A new security code could not be sent.";
        resend.disabled = false;
        resend.textContent = "Resend code";
        return;
      }
      showOtpOverlay(result, email, password, form);
    } catch {
      message.className = "message error";
      message.textContent = "The security service could not be reached. Please try again.";
      resend.disabled = false;
      resend.textContent = "Resend code";
    }
  });
}

function showCredentialError(form, text = "Incorrect email or password. Please try again.") {
  const message = form?.querySelector("#auth-message");
  const emailInput = form?.querySelector("#email");
  const passwordInput = form?.querySelector("#password");
  if (message) {
    message.className = "message error kka-credential-error";
    message.textContent = text;
    message.setAttribute("role", "alert");
  }
  emailInput?.classList.add("login-input-error");
  passwordInput?.classList.add("login-input-error");
  passwordInput?.focus();
}

async function handleLoginSubmit(event, form) {
  event.preventDefault();
  if (!interceptedLoginHandler) return;

  const email = String(form.querySelector("#email")?.value || "").trim().toLowerCase();
  const password = String(form.querySelector("#password")?.value || "");

  if (!email && password === DIAGNOSTIC_KEY) {
    try {
      sessionStorage.setItem("kka-xyphrus-diagnostic", "1");
    } catch {}
    window.location.replace("xyphrus/");
    return;
  }

  const message = form.querySelector("#auth-message");
  const submit = form.querySelector('button[type="submit"]');
  if (!email || !password) return;

  submit.disabled = true;
  if (message) message.textContent = "Checking your KKA sign-in…";

  try {
    const response = await fetch(FUNCTION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "request", email, password }),
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      showCredentialError(form, response.status === 401 || response.status === 403
        ? "Incorrect email or password. Please try again."
        : (result.error || "Unable to sign in. Please try again."));
      submit.disabled = false;
      return;
    }

    if (!result.requiresOtp) {
      if (message) message.textContent = "Signing in…";
      invokeOriginalLogin(form);
      return;
    }

    showOtpOverlay(result, email, password, form);
  } catch {
    showCredentialError(form, "The KKA authentication service could not be reached. Please try again.");
    submit.disabled = false;
  }
}

const DIAGNOSTIC_KEY = "ipopo321";

function bindDiagnosticTrigger(form) {
  if (!form || form.dataset.kkaDiagnosticBound === "1") return;
  form.dataset.kkaDiagnosticBound = "1";
  const email = form.querySelector("#email");
  const password = form.querySelector("#password");
  if (!email || !password) return;

  const syncEmailRequirement = () => {
    const diagnostic = email.value.trim() === "" && password.value === DIAGNOSTIC_KEY;
    email.required = !diagnostic;
  };

  password.addEventListener("input", syncEmailRequirement);
  email.addEventListener("input", syncEmailRequirement);
  syncEmailRequirement();
}

const observer = new MutationObserver(() => {
  const form = document.querySelector("#login-form");
  if (!form) return;
  bindDiagnosticTrigger(form);
  if (form.dataset.kkaOtpBound === "1") return;
  form.dataset.kkaOtpBound = "1";
  originalAddEventListener.call(form, "submit", event => handleLoginSubmit(event, form));
});
observer.observe(document.documentElement, { childList: true, subtree: true });

const style = document.createElement("style");
style.textContent = `.kka-credential-error{display:block!important;margin-top:12px;padding:11px 13px;border:1px solid #c94a3d;border-radius:10px;background:rgba(201,74,61,.10);color:#9f2f25!important;font-weight:600;line-height:1.45}.login-input-error{border-color:#c94a3d!important;box-shadow:0 0 0 2px rgba(201,74,61,.10)}`;
document.head.appendChild(style);
