import { createClient as createSupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

const supabase = createSupabaseClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const root = document.querySelector("#app");
let refreshTimer = null;
let observer = null;

const esc = (v) => String(v ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c]));

function formatSize(bytes) {
  if (bytes < 1024 ** 2) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function installStyles() {
  if (document.querySelector("#storage-monitor-styles")) return;
  const style = document.createElement("style");
  style.id = "storage-monitor-styles";
  style.textContent = `
    .storage-monitor{margin-top:20px;padding:22px;border:1px solid rgba(17,24,39,.08);border-radius:18px;background:linear-gradient(135deg,#fff,#f8fafc);box-shadow:0 8px 24px rgba(15,23,42,.05)}
    .storage-monitor .sm-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}
    .storage-monitor .sm-title{display:flex;align-items:center;gap:10px}
    .storage-monitor .sm-icon{width:38px;height:38px;border-radius:11px;display:grid;place-items:center;background:#eef2ff;font-size:18px}
    .storage-monitor h2{margin:0;font-size:18px}
    .storage-monitor .sm-value{font-size:30px;font-weight:750;letter-spacing:-.03em;margin-top:14px}
    .storage-monitor .sm-sub{margin-top:3px;font-size:13px}
    .storage-monitor .sm-track{height:10px;background:#e5e7eb;border-radius:999px;overflow:hidden;margin-top:16px}
    .storage-monitor .sm-bar{height:100%;border-radius:999px;background:#64748b;transition:width .25s ease}
    .storage-monitor[data-level="warning"] .sm-bar{background:#d97706}
    .storage-monitor[data-level="critical"] .sm-bar{background:#dc2626}
    .storage-monitor .sm-foot{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-top:10px;font-size:12px}
    .storage-monitor .sm-status{font-weight:650}
    .storage-monitor .sm-refresh{border:0;background:transparent;text-decoration:underline;cursor:pointer;padding:4px;font:inherit}
    .storage-monitor .sm-meta{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:17px}
    .storage-monitor .sm-meta div{padding:11px 12px;border-radius:12px;background:rgba(241,245,249,.8)}
    .storage-monitor .sm-meta span{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#64748b}
    .storage-monitor .sm-meta strong{display:block;margin-top:3px;font-size:14px}
    .storage-monitor .sm-note{margin:15px 0 0;font-size:12px;line-height:1.5;color:#64748b}
  `;
  document.head.appendChild(style);
}

async function isAdmin() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: profile } = await supabase.from("profiles").select("role,active").eq("id", user.id).maybeSingle();
  return profile?.active === true && profile.role === "admin";
}

async function loadUsage(panel) {
  const button = panel.querySelector(".sm-refresh");
  if (button) button.disabled = true;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Session expired");
    const response = await fetch(`${SUPABASE_URL}/functions/v1/storage-usage-admin`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({}),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Unable to read storage usage");

    const pct = Math.max(0, Number(result.usagePercent || 0));
    const displayPct = pct.toFixed(pct >= 10 ? 0 : 1);
    const level = pct >= Number(result.criticalPercent || 95) ? "critical" : pct >= Number(result.warningPercent || 80) ? "warning" : "normal";
    panel.dataset.level = level;
    panel.querySelector(".sm-value").textContent = `${formatSize(result.totalBytes)} used`;
    panel.querySelector(".sm-sub").textContent = `${displayPct}% of the current 1 GB baseline`;
    panel.querySelector(".sm-bar").style.width = `${Math.min(pct, 100)}%`;
    panel.querySelector(".sm-percent").textContent = `${displayPct}%`;
    panel.querySelector(".sm-status").textContent = level === "critical" ? "Critical — upgrade storage" : level === "warning" ? "Warning — plan ahead for upgrade" : "Healthy — storage has room";
    panel.querySelector(".sm-objects").textContent = Number(result.objectCount || 0).toLocaleString("en-IN");
    panel.querySelector(".sm-bucket-size").textContent = formatSize(result.totalBytes);
    panel.querySelector(".sm-updated").textContent = `Updated ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  } catch (error) {
    panel.dataset.level = "warning";
    panel.querySelector(".sm-value").textContent = "Storage usage unavailable";
    panel.querySelector(".sm-sub").textContent = esc(error.message || "Unable to load current usage.");
    panel.querySelector(".sm-bar").style.width = "0%";
    panel.querySelector(".sm-status").textContent = "Check failed — retry";
  } finally {
    if (button) button.disabled = false;
  }
}

function renderPanel() {
  const main = document.querySelector(".portal-main");
  const stats = main?.querySelector(".stats");
  if (!main || !stats || !root || root.querySelector(".storage-monitor")) return;
  installStyles();
  const panel = document.createElement("section");
  panel.className = "storage-monitor";
  panel.innerHTML = `
    <div class="sm-head">
      <div>
        <div class="sm-title"><span class="sm-icon">▣</span><div><p class="eyebrow">DOCUMENT STORAGE</p><h2>Storage health</h2></div></div>
        <div class="sm-value">Checking…</div>
        <div class="sm-sub muted">Reading private client document storage</div>
      </div>
      <button class="sm-refresh" type="button">Refresh</button>
    </div>
    <div class="sm-track" aria-label="Storage usage"><div class="sm-bar" style="width:0%"></div></div>
    <div class="sm-foot"><span class="sm-status">Checking storage…</span><strong class="sm-percent">—</strong></div>
    <div class="sm-meta"><div><span>Objects</span><strong class="sm-objects">—</strong></div><div><span>Bucket usage</span><strong class="sm-bucket-size">—</strong></div></div>
    <p class="sm-note">The monitor watches the private <strong>client-documents</strong> bucket. The current baseline is 1 GB; the system warns at 80% and becomes critical at 95%.</p>
    <div class="sm-foot"><span class="sm-updated">Not updated yet</span><span>Admin only</span></div>`;
  stats.insertAdjacentElement("afterend", panel);
  panel.querySelector(".sm-refresh").addEventListener("click", () => loadUsage(panel));
  loadUsage(panel);
}

async function tick() {
  if (!(await isAdmin())) return;
  renderPanel();
}

function start() {
  if (refreshTimer) clearInterval(refreshTimer);
  if (observer) observer.disconnect();
  observer = new MutationObserver(() => { void tick(); });
  observer.observe(root, { childList: true, subtree: true });
  void tick();
  refreshTimer = setInterval(() => { void tick(); }, 5 * 60 * 1000);
}

start();
