import { createClient as createSupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

const supabase = createSupabaseClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const AREAS = ["gst", "tds", "income_tax", "accounts", "mca", "other"];
const MONTHS = [["01", "January"], ["02", "February"], ["03", "March"], ["04", "April"], ["05", "May"], ["06", "June"], ["07", "July"], ["08", "August"], ["09", "September"], ["10", "October"], ["11", "November"], ["12", "December"]];

const esc = value => String(value ?? "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
const areaLabel = area => area === "income_tax" ? "Income Tax" : area === "mca" ? "MCA" : area.toUpperCase();
const notify = (type, message, detail = "") => { try { window.KKANotify?.[type]?.(message, detail); } catch {} };

function financialYears(existing) {
  const now = new Date();
  const firstYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const years = Array.from({ length: 12 }, (_, index) => {
    const year = firstYear - index;
    return `${year}-${String((year + 1) % 100).padStart(2, "0")}`;
  });
  if (existing && !years.includes(existing)) years.push(existing);
  return years;
}

function areaForNode(node, nodes) {
  let root = node;
  for (let depth = 0; root?.parent_id && depth < 20; depth++) {
    root = nodes.find(item => item.id === root.parent_id);
  }
  const normalized = String(root?.slug ?? "").toLowerCase().replace(/-/g, "_");
  return AREAS.includes(normalized) ? normalized : "other";
}

function nodePath(node, nodes) {
  const names = [node.name];
  let current = node;
  for (let depth = 0; current?.parent_id && depth < 20; depth++) {
    current = nodes.find(item => item.id === current.parent_id);
    if (!current) break;
    names.unshift(current.name);
  }
  return names.join(" / ");
}

async function loadIdentity() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data, error } = await supabase.from("profiles").select("role,active").eq("id", user.id).maybeSingle();
  if (error) return false;
  return !!data?.active && ["admin", "staff"].includes(data.role);
}

function setActive() {
  document.querySelectorAll(".sidebar nav a").forEach(link => link.classList.toggle("active", link.dataset.view === "review"));
}

async function loadAllPages(queryFactory) {
  const pageSize = 500;
  let offset = 0;
  const all = [];
  while (true) {
    const { data, error } = await queryFactory().range(offset, offset + pageSize - 1);
    if (error) return { data: null, error };
    const page = data ?? [];
    all.push(...page);
    offset += page.length;
    if (page.length < pageSize) return { data: all, error: null };
  }
}

function updateFilingFields(row, nodes, preferredId = "") {
  const area = row.querySelector("[data-field=area]")?.value ?? "";
  const folder = row.querySelector("[data-field=filing-node]");
  const yearLabel = row.querySelector("[data-fy-label]");
  const periodLabel = row.querySelector("[data-period-label]");
  if (!folder || !yearLabel || !periodLabel) return;

  const choices = nodes.filter(node => node.enabled && areaForNode(node, nodes) === area)
    .sort((left, right) => nodePath(left, nodes).localeCompare(nodePath(right, nodes)));
  folder.innerHTML = `<option value="">Select filing subject or folder…</option>${choices.map(node => `<option value="${esc(node.id)}">${esc(nodePath(node, nodes))}</option>`).join("")}`;
  folder.value = choices.some(node => node.id === preferredId) ? preferredId : "";

  const node = choices.find(item => item.id === folder.value);
  const needsYear = !!node?.requires_financial_year;
  const periodMode = node?.period_mode ?? "none";
  const existingYear = row.querySelector("[data-field=financial-year]")?.value ?? "";
  yearLabel.innerHTML = `Financial year<select data-field="financial-year" ${needsYear ? "" : "disabled"}><option value="">${needsYear ? "Select financial year…" : "Not required"}</option>${needsYear ? financialYears(existingYear).map(year => `<option value="${year}" ${year === existingYear ? "selected" : ""}>FY ${year}</option>`).join("") : ""}</select>`;

  const existingPeriod = row.querySelector("[data-field=period]")?.value ?? "";
  if (periodMode === "custom") {
    periodLabel.innerHTML = `Period<input data-field="period" maxlength="80" value="${esc(existingPeriod)}" placeholder="Enter period">`;
  } else {
    const options = periodMode === "month"
      ? `<option value="">Select month…</option>${MONTHS.map(([value, name]) => `<option value="${value}" ${value === existingPeriod ? "selected" : ""}>${name}</option>`).join("")}`
      : periodMode === "quarter"
        ? `<option value="">Select quarter…</option>${["Q1", "Q2", "Q3", "Q4"].map(value => `<option value="${value}" ${value === existingPeriod ? "selected" : ""}>${value}</option>`).join("")}`
        : `<option value="">No period required</option>`;
    periodLabel.innerHTML = `Period<select data-field="period" ${periodMode === "none" ? "disabled" : ""}>${options}</select>`;
  }
}

function updateClientOptions(row, clients, preferredId = "") {
  const area = row.querySelector("[data-field=area]")?.value ?? "";
  const select = row.querySelector("[data-field=client]");
  if (!select) return;
  const choices = clients.filter(client => area !== "mca" || !!client.cin);
  select.innerHTML = `<option value="">${area === "mca" ? "Select client with CIN…" : "Select client…"}</option>${choices.map(client => `<option value="${esc(client.id)}">${esc(client.display_name || client.legal_name)}</option>`).join("")}`;
  select.value = choices.some(client => client.id === preferredId) ? preferredId : "";
}

async function resolveItem(documentId, action) {
  const row = document.querySelector(`[data-review-row="${documentId}"]`);
  if (!row) return;
  const area = row.querySelector("[data-field=area]")?.value ?? "";
  const filingNodeId = row.querySelector("[data-field=filing-node]")?.value ?? "";
  const filingNode = window.__kkaReviewFilingNodes?.find(node => node.id === filingNodeId);
  const financialYear = row.querySelector("[data-field=financial-year]")?.value ?? "";
  const period = row.querySelector("[data-field=period]")?.value?.trim() ?? "";
  const clientId = row.querySelector("[data-field=client]")?.value ?? "";
  if (action === "accept" && !clientId) { notify("error", "Client is required before accepting the document."); return; }
  if (action === "accept" && !filingNode) { notify("error", "Select the exact filing subject or folder before accepting the document."); return; }
  if (action === "accept" && areaForNode(filingNode, window.__kkaReviewFilingNodes ?? []) !== area) { notify("error", "The filing folder must match the selected document area."); return; }
  if (action === "accept" && filingNode.requires_financial_year && !financialYear) { notify("error", "Financial year is required for this filing folder."); return; }
  if (action === "accept" && filingNode.period_mode !== "none" && !period) { notify("error", "Filing period is required for this folder."); return; }

  let rejectionReason = null;
  if (action === "reject") {
    const entered = prompt("Enter the reason this document is being rejected:");
    if (entered === null) return;
    rejectionReason = entered.trim();
    if (!rejectionReason) { notify("error", "A rejection reason is required."); return; }
    if (rejectionReason.length > 1000) { notify("error", "Keep the rejection reason under 1,000 characters."); return; }
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) { notify("error", "The session has expired. Please sign in again."); return; }
  const button = row.querySelector(`[data-action="${action}"]`);
  if (button) button.disabled = true;
  notify("info", action === "accept" ? "Transferring and classifying document…" : "Rejecting document…");
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/resolve-review`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ documentId, clientId: clientId || null, filingNodeId: filingNodeId || null, area, financialYear: financialYear || null, period: period || null, action, rejectionReason }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) { notify("error", result.error || `The review action was not completed (HTTP ${response.status}).`); if (button) button.disabled = false; return; }
    if (result.auditLogged === false) notify("info", "Review completed, but the audit entry could not be recorded.");
    else if (action === "accept" && result.oneDriveRegistryLinked === false) notify("info", "Document accepted and sent to OneDrive, but its registry link needs attention.");
    else notify("success", action === "accept" ? "Document accepted, classified and sent to OneDrive." : "Document rejected successfully.");
    await render();
  } catch (error) {
    notify("error", error?.message || "The review action was not completed.");
    if (button) button.disabled = false;
  }
}

async function render() {
  setActive();
  const main = document.querySelector(".portal-main");
  if (!main) return;
  main.innerHTML = `<header><div><p class="eyebrow">DOCUMENT CONTROL</p><h1>Review queue</h1><p class="muted">Review files that could not be confidently classified during upload.</p></div><button class="secondary" id="refresh-review">Refresh</button></header><section class="panel"><div class="panel-head"><div><p class="eyebrow">PENDING REVIEW</p><h2>Files awaiting action</h2><p class="muted">Select the client, area and exact filing subject or folder. Acceptance transfers the file to OneDrive before it becomes available to the client.</p></div></div><div id="review-list"><p class="muted">Loading review queue…</p></div></section>`;
  document.getElementById("refresh-review")?.addEventListener("click", render);

  const [docsResult, clientsResult, filingResult] = await Promise.all([
    loadAllPages(() => supabase.from("documents").select("id,original_filename,area,financial_year,filing_period,filing_node_id,status,storage_path,created_at,client_id,clients(display_name,legal_name)").eq("status", "review").order("created_at", { ascending: false }).order("id", { ascending: false })),
    loadAllPages(() => supabase.from("clients").select("id,legal_name,display_name,cin").eq("active", true).order("legal_name").order("id")),
    supabase.rpc("get_filing_structure"),
  ]);
  const box = document.getElementById("review-list");
  if (docsResult.error) { box.innerHTML = `<p class="muted">Unable to load the review queue: ${esc(docsResult.error.message)}</p>`; return; }
  if (clientsResult.error) { box.innerHTML = `<p class="muted">Unable to load clients for review: ${esc(clientsResult.error.message)}</p>`; return; }
  if (filingResult.error) { box.innerHTML = `<p class="muted">Unable to load filing folders for review: ${esc(filingResult.error.message)}</p>`; return; }
  const docs = docsResult.data ?? [];
  const clients = clientsResult.data ?? [];
  const filingNodes = (Array.isArray(filingResult.data) ? filingResult.data : []).filter(node => node.enabled);
  window.__kkaReviewFilingNodes = filingNodes;
  if (!docs.length) { box.innerHTML = `<div class="review-empty"><strong>No documents are awaiting review.</strong><p class="muted">New files requiring manual classification will appear here.</p></div>`; return; }

  box.innerHTML = docs.map(doc => `<article class="review-card" data-review-row="${esc(doc.id)}"><div class="review-card-head"><div><span class="file-icon">${esc((doc.original_filename.split(".").pop() || "FILE").toUpperCase())}</span><strong>${esc(doc.original_filename)}</strong><p class="muted">Uploaded ${doc.created_at ? new Date(doc.created_at).toLocaleString() : "—"}</p></div><span class="pill neutral">Review required</span></div><div class="review-meta"><div><span>Current area</span><strong>${esc(areaLabel(doc.area || "other"))}</strong></div><div><span>Financial year</span><strong>${esc(doc.financial_year || "Not classified")}</strong></div><div><span>Period</span><strong>${esc(doc.filing_period || "Not classified")}</strong></div></div><div class="review-form"><label>Client<select data-field="client"><option value="">Select client…</option></select></label><label>Area<select data-field="area"><option value="">Select area…</option>${AREAS.map(area => `<option value="${area}" ${area === doc.area ? "selected" : ""}>${areaLabel(area)}</option>`).join("")}</select></label><label>Filing subject / folder<select data-field="filing-node"><option value="">Select filing subject or folder…</option></select></label><label data-fy-label>Financial year<select data-field="financial-year"><option value="">Select filing folder first…</option></select></label><label data-period-label>Period<select data-field="period"><option value="">Select filing folder first…</option></select></label></div><div class="review-actions"><button class="secondary" data-action="reject">Reject</button><button class="primary" data-action="accept">Accept &amp; classify</button></div></article>`).join("");

  box.querySelectorAll("[data-review-row]").forEach(row => {
    const doc = docs.find(item => item.id === row.dataset.reviewRow);
    const areaSelect = row.querySelector("[data-field=area]");
    const nodeSelect = row.querySelector("[data-field=filing-node]");
    updateClientOptions(row, clients, doc?.client_id ?? "");
    updateFilingFields(row, filingNodes, doc?.filing_node_id ?? "");
    areaSelect?.addEventListener("change", () => {
      updateClientOptions(row, clients, row.querySelector("[data-field=client]")?.value ?? "");
      updateFilingFields(row, filingNodes);
    });
    nodeSelect?.addEventListener("change", () => updateFilingFields(row, filingNodes, nodeSelect.value));
    row.querySelectorAll("[data-action]").forEach(button => button.addEventListener("click", () => resolveItem(row.dataset.reviewRow, button.dataset.action)));
  });
}

window.KKAReviewQueueRender = async () => { if (await loadIdentity()) await render(); };
