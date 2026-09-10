import { createClient as createSupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

const supabase = createSupabaseClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const MAX_BYTES = 50 * 1024 * 1024;
const esc = v => String(v ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
let files = [];
let bound = false;

async function sessionToken() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Your session has expired. Please sign in again.");
  return session.access_token;
}

async function sha256(file) {
  const buffer = await file.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(hash)].map(v => v.toString(16).padStart(2, "0")).join("");
}

async function prepare(item) {
  const token = await sessionToken();
  const r = await fetch(`${SUPABASE_URL}/functions/v1/prepare-upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      filename: item.file.name,
      byteSize: item.file.size,
      contentType: item.file.type || "application/octet-stream",
      sha256: item.sha256
    })
  });
  const result = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(result.message || result.error || `Preparation failed (HTTP ${r.status})`);
  return result;
}

async function uploadPrepared(item) {
  const token = await sessionToken();
  const { data, error } = await supabase.storage
    .from("client-documents")
    .uploadToSignedUrl(item.prepared.objectPath || item.objectPath, item.prepared.token, item.file, { contentType: item.file.type || "application/octet-stream" });
  if (error) throw error;
  const r = await fetch(`${SUPABASE_URL}/functions/v1/complete-upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ uploadId: item.prepared.uploadId })
  });
  const result = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(result.error || `Completion failed (HTTP ${r.status})`);
  return { ...result, storageResult: data };
}

function classifyText(c) {
  const cls = c?.classification || {};
  const area = cls.area ? cls.area.replace("_", " ") : "unknown";
  const period = cls.period ? ` · ${cls.period}` : "";
  const fy = cls.financialYear ? ` · ${cls.financialYear}` : "";
  const confidence = Number(cls.confidence ?? 0);
  return `${area}${fy}${period} · ${confidence}% confidence`;
}

function render() {
  const main = document.querySelector(".portal-main");
  if (!main) return;
  document.querySelectorAll(".sidebar nav a").forEach(a => a.classList.toggle("active", a.dataset.view === "documents"));
  main.innerHTML = `<header><div><p class="eyebrow">SECURE DOCUMENT INGESTION</p><h1>Document Uploader</h1><p class="muted">Drop KKA documents here. The uploader checks the filename against client identifiers and proposes the filing area and period before storage.</p></div><div class="page-actions"><button class="secondary" id="uploader-clear">Clear</button></div></header>
    <section class="panel uploader-panel">
      <div class="drop-zone" id="drop-zone" tabindex="0" role="button" aria-label="Choose documents to upload">
        <div class="drop-icon">↑</div><h2>Drop documents here</h2><p class="muted">or click to choose files · maximum 50 MB per file</p>
        <input id="file-input" type="file" multiple hidden />
        <button class="secondary" id="choose-files" type="button">Choose files</button>
      </div>
      <div class="uploader-summary" id="uploader-summary"><span>No files selected</span></div>
      <div class="upload-list" id="upload-list"></div>
      <div class="uploader-actions"><button class="primary" id="analyze-files" type="button" disabled>Check &amp; classify files</button><button class="primary" id="upload-files" type="button" disabled>Upload checked files</button></div>
      <div class="form-message" id="uploader-message" aria-live="polite"></div>
    </section>`;
  bind();
  drawList();
}

function bind() {
  const input = document.querySelector("#file-input");
  const drop = document.querySelector("#drop-zone");
  document.querySelector("#choose-files").addEventListener("click", () => input.click());
  drop.addEventListener("click", e => { if (e.target.closest("button")) return; input.click(); });
  drop.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } });
  input.addEventListener("change", e => addFiles([...e.target.files]));
  ["dragenter", "dragover"].forEach(type => drop.addEventListener(type, e => { e.preventDefault(); drop.classList.add("dragover"); }));
  ["dragleave", "drop"].forEach(type => drop.addEventListener(type, e => { e.preventDefault(); drop.classList.remove("dragover"); }));
  drop.addEventListener("drop", e => addFiles([...e.dataTransfer.files]));
  document.querySelector("#uploader-clear").addEventListener("click", () => { files = []; drawList(); });
  document.querySelector("#analyze-files").addEventListener("click", analyzeAll);
  document.querySelector("#upload-files").addEventListener("click", uploadAll);
}

function addFiles(selected) {
  const message = document.querySelector("#uploader-message");
  const accepted = selected.filter(file => file.size > 0 && file.size <= MAX_BYTES);
  const rejected = selected.filter(file => file.size === 0 || file.size > MAX_BYTES);
  const existing = new Set(files.map(x => `${x.file.name}|${x.file.size}|${x.file.lastModified}`));
  accepted.forEach(file => {
    const key = `${file.name}|${file.size}|${file.lastModified}`;
    if (!existing.has(key)) files.push({ file, state: "queued" });
  });
  message.textContent = rejected.length ? `${rejected.length} file(s) skipped because they are empty or exceed 50 MB.` : "";
  drawList();
}

function drawList() {
  const list = document.querySelector("#upload-list");
  const summary = document.querySelector("#uploader-summary");
  const analyze = document.querySelector("#analyze-files");
  const upload = document.querySelector("#upload-files");
  if (!list || !summary) return;
  summary.innerHTML = files.length ? `<strong>${files.length}</strong> file${files.length === 1 ? "" : "s"} selected · ${formatBytes(files.reduce((n, x) => n + x.file.size, 0))}` : "<span>No files selected</span>";
  list.innerHTML = files.map((item, i) => `<div class="upload-item"><div class="upload-file-icon">${esc(item.file.name.split(".").pop()?.slice(0, 5).toUpperCase() || "FILE")}</div><div class="upload-file-main"><strong>${esc(item.file.name)}</strong><span class="muted">${formatBytes(item.file.size)}${item.classification ? ` · ${esc(classifyText(item.classification))}` : ""}</span>${item.error ? `<span class="upload-error">${esc(item.error)}</span>` : ""}</div><span class="pill ${item.state === "accepted" ? "success" : item.state === "review" ? "neutral" : item.state === "error" ? "danger" : "neutral"}">${esc(labelState(item.state))}</span><button class="secondary table-action" data-remove="${i}" type="button">Remove</button></div>`).join("");
  list.querySelectorAll("[data-remove]").forEach(b => b.addEventListener("click", () => { files.splice(Number(b.dataset.remove), 1); drawList(); }));
  analyze.disabled = !files.length || files.some(x => ["preparing", "uploading"].includes(x.state));
  upload.disabled = !files.some(x => x.state === "prepared");
}

function labelState(state) {
  return ({ queued: "Not checked", preparing: "Checking…", prepared: "Ready", uploading: "Uploading…", accepted: "Accepted", review: "Review queue", duplicate: "Duplicate", error: "Error" })[state] || state;
}
function formatBytes(n) { if (n < 1024) return `${n} B`; if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`; if (n < 1073741824) return `${(n / 1048576).toFixed(1)} MB`; return `${(n / 1073741824).toFixed(2)} GB`; }

async function analyzeAll() {
  const message = document.querySelector("#uploader-message");
  message.textContent = "Checking filenames and preparing secure upload requests…";
  for (const item of files) {
    if (item.state !== "queued" && item.state !== "error") continue;
    item.state = "preparing"; item.error = ""; drawList();
    try {
      item.sha256 = await sha256(item.file);
      const result = await prepare(item);
      if (result.state === "duplicate") { item.state = "duplicate"; item.classification = null; item.error = result.message || "Identical file already exists."; }
      else { item.prepared = result; item.classification = result; item.state = "prepared"; }
    } catch (e) { item.state = "error"; item.error = e.message || "File could not be prepared."; }
    drawList();
  }
  const ready = files.filter(x => x.state === "prepared").length;
  message.textContent = ready ? `${ready} file(s) ready. Review the proposed classification above, then upload.` : "No files are ready to upload.";
}

async function uploadAll() {
  const message = document.querySelector("#uploader-message");
  const ready = files.filter(x => x.state === "prepared");
  if (!ready.length) return;
  message.textContent = `Uploading ${ready.length} file(s)…`;
  for (const item of ready) {
    item.state = "uploading"; item.error = ""; drawList();
    try {
      const result = await uploadPrepared(item);
      item.state = result.state === "accepted" ? "accepted" : result.state === "duplicate" ? "duplicate" : "review";
      item.result = result;
      item.classification = result;
    } catch (e) { item.state = "error"; item.error = e.message || "Upload failed."; }
    drawList();
  }
  const done = files.filter(x => ["accepted", "review", "duplicate"].includes(x.state)).length;
  message.textContent = `${done} file(s) processed. Accepted files are stored; uncertain files are in the review queue.`;
}

function installNavigation() {
  if (bound) return;
  bound = true;
  document.addEventListener("click", e => {
    const link = e.target.closest('a[data-view="documents"]');
    if (!link) return;
    if (!document.querySelector(".portal-main")) return;
    e.preventDefault();
    render();
  }, true);
}

installNavigation();

// The main portal renders asynchronously; keep this listener lightweight and only
// expose the uploader after the authenticated portal shell exists.
const observer = new MutationObserver(() => {
  if (document.querySelector('.sidebar a[data-view="documents"]') && !document.querySelector('.uploader-panel')) {
    // Navigation remains controlled by the capture listener above; no auto-render here.
  }
});
observer.observe(document.querySelector("#app") || document.body, { childList: true, subtree: true });
