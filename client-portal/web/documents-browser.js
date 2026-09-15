import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const esc = (v) => String(v ?? "").replace(/[&<>\"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const labels = { gst: "GST", tds: "TDS", income_tax: "Income Tax", accounts: "Accounts", mca: "MCA", other: "Other" };
const months = { "01":"January", "02":"February", "03":"March", "04":"April", "05":"May", "06":"June", "07":"July", "08":"August", "09":"September", "10":"October", "11":"November", "12":"December" };
let state = { clients: [], clientId: "", docs: [], area: "", fy: "", period: "", busy: false };

function notify(message, detail = "") { try { window.KKANotify?.error?.(message, detail); } catch {} }
function clientName(c) { return c?.display_name || c?.legal_name || "Unnamed client"; }
function periodName(area, value) { return ["gst", "other"].includes(area) ? (months[value] || value) : value; }

async function loadClients() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: profile, error: profileError } = await supabase.from("profiles").select("role,active").eq("id", user.id).maybeSingle();
  if (profileError) throw profileError;
  if (!profile?.active) return false;
  const staff = ["admin", "staff"].includes(profile.role);
  if (staff) {
    const r = await supabase.from("clients").select("id,legal_name,display_name,cin").eq("active", true).order("legal_name");
    if (r.error) throw r.error;
    state.clients = r.data || [];
  } else {
    const m = await supabase.from("client_memberships").select("client_id").eq("user_id", user.id).limit(1).maybeSingle();
    if (m.error || !m.data) throw new Error("No client profile is linked to this login.");
    const r = await supabase.from("clients").select("id,legal_name,display_name,cin").eq("id", m.data.client_id).eq("active", true).maybeSingle();
    if (r.error || !r.data) throw new Error("The linked client profile could not be loaded.");
    state.clients = [r.data];
  }
  if (!state.clientId || !state.clients.some(c => c.id === state.clientId)) state.clientId = state.clients.length === 1 ? state.clients[0].id : "";
  return true;
}

async function loadDocs() {
  if (!state.clientId) { state.docs = []; return; }
  const r = await supabase.from("documents").select("id,client_id,original_filename,area,financial_year,filing_period,status,byte_size,created_at").eq("client_id", state.clientId).eq("status", "accepted").is("deleted_at", null).order("created_at", { ascending: false }).limit(1000);
  if (r.error) throw r.error;
  state.docs = r.data || [];
}

function render() {
  const main = document.querySelector(".portal-main");
  if (!main) return;
  const client = state.clients.find(c => c.id === state.clientId);
  const areas = [...new Set(state.docs.map(d => d.area).filter(Boolean))];
  const visible = state.docs.filter(d => (!state.area || d.area === state.area) && (!state.fy || d.financial_year === state.fy) && (!state.period || d.filing_period === state.period));
  const years = [...new Set(state.docs.filter(d => !state.area || d.area === state.area).map(d => d.financial_year).filter(Boolean))].sort().reverse();
  const periods = [...new Set(state.docs.filter(d => d.area === state.area && (!state.fy || d.financial_year === state.fy)).map(d => d.filing_period).filter(Boolean))].sort();
  main.innerHTML = `<header><div><p class="eyebrow">DOCUMENT LIBRARY</p><h1>Documents</h1><p class="muted">Browse accepted documents by client and filing structure.</p></div></header><section class="panel" id="documents-browser-panel"><div style="display:flex;gap:12px;align-items:end;flex-wrap:wrap"><label style="min-width:280px">Client<select id="doc-client" style="width:100%;padding:10px;margin-top:6px"><option value="">Select client</option>${state.clients.map(c => `<option value="${esc(c.id)}" ${c.id===state.clientId?"selected":""}>${esc(clientName(c))}${c.cin?` — ${esc(c.cin)}`:""}</option>`).join("")}</select></label><button class="secondary" id="doc-refresh" type="button">Refresh</button></div><p class="muted" style="margin-top:14px">${client ? esc(clientName(client)) : "Select a client to browse documents."}</p><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:18px">${areas.map(a => `<button class="${state.area===a?"primary":"secondary"} compact" type="button" data-area="${esc(a)}">${esc(labels[a]||a)}</button>`).join("")}</div>${state.area && years.length ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">${years.map(y => `<button class="${state.fy===y?"primary":"secondary"} compact" type="button" data-fy="${esc(y)}">FY ${esc(y)}</button>`).join("")}</div>` : ""}${state.area && state.fy && periods.length ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">${periods.map(p => `<button class="${state.period===p?"primary":"secondary"} compact" type="button" data-period="${esc(p)}">${esc(periodName(state.area,p))}</button>`).join("")}</div>` : ""}<div style="margin-top:20px">${state.clientId ? (visible.length ? visible.map(d => `<div class="row"><div><strong>${esc(d.original_filename)}</strong><p>${esc(labels[d.area]||d.area)}${d.financial_year?` · FY ${esc(d.financial_year)}`:""}${d.filing_period?` · ${esc(periodName(d.area,d.filing_period))}`:""}</p></div><span class="pill success">accepted</span></div>`).join("") : `<div class="browser-empty"><p class="muted">No accepted documents match the selected folder.</p></div>`) : ""}</div></section>`;
  document.getElementById("doc-client")?.addEventListener("change", async e => { state.clientId=e.target.value; state.area=""; state.fy=""; state.period=""; await refresh(); });
  document.getElementById("doc-refresh")?.addEventListener("click", refresh);
  main.querySelectorAll("[data-area]").forEach(b => b.addEventListener("click", () => { state.area=b.dataset.area; state.fy=""; state.period=""; render(); }));
  main.querySelectorAll("[data-fy]").forEach(b => b.addEventListener("click", () => { state.fy=b.dataset.fy; state.period=""; render(); }));
  main.querySelectorAll("[data-period]").forEach(b => b.addEventListener("click", () => { state.period=b.dataset.period; render(); }));
}

async function refresh() {
  if (state.busy) return;
  state.busy = true;
  try { await loadClients(); await loadDocs(); render(); }
  catch (e) { console.error("KKA Documents", e); notify("Documents could not be loaded.", e?.message || "Database error"); }
  finally { state.busy = false; }
}

async function openDocuments() {
  const main = document.querySelector(".portal-main");
  if (!main) return;
  main.innerHTML = `<section class="panel"><p class="muted">Loading Documents…</p></section>`;
  await refresh();
}

document.addEventListener("click", (event) => {
  const link = event.target.closest('a[data-view="documents"]');
  if (!link) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  openDocuments();
}, true);

window.KKADocumentsOpen = openDocuments;
