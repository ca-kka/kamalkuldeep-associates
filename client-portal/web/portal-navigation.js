/* KKA Client Portal — navigation isolation layer.
 *
 * The legacy app shell owns Overview and Clients. Dedicated modules own the
 * remaining views. This layer removes the legacy anchor listeners from those
 * dedicated links after the portal template is mounted, without changing
 * authentication, database access, storage, OneDrive, or client permissions.
 *
 * Why this exists: app.js historically attached one generic click handler to
 * every sidebar link. That handler could win over a dedicated view module and
 * send the user back to Overview. Removing only those competing listeners is
 * safer than rewriting the mature app shell or duplicating route logic.
 */

const DEDICATED_VIEWS = new Set([
  "documents",
  "review",
  "storage",
  "activity",
  "staff-access",
  "access-requests",
  "filing-structure"
]);

let scheduled = false;

function isolateDedicatedLinks() {
  document.querySelectorAll(".sidebar nav:not(.legal-footer) a[data-view]").forEach((link) => {
    const view = link.dataset.view;
    if (!DEDICATED_VIEWS.has(view) || link.dataset.kkaNavigationIsolated === "1") return;

    // Cloning an anchor removes listeners attached directly to that anchor.
    // The dedicated modules use document-level capture handlers, so their
    // listeners remain intact and continue to receive the replacement link.
    const replacement = link.cloneNode(true);
    replacement.dataset.kkaNavigationIsolated = "1";
    link.replaceWith(replacement);
  });
}

function scheduleIsolation() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    isolateDedicatedLinks();
  });
}

const observer = new MutationObserver(scheduleIsolation);
observer.observe(document.documentElement, { childList: true, subtree: true });

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", scheduleIsolation, { once: true });
} else {
  scheduleIsolation();
}

window.KKANavigationHealth = {
  dedicatedViews: [...DEDICATED_VIEWS],
  isolate: isolateDedicatedLinks
};
