import "./access-requests.js?v=20260914-1";

// Navigation compatibility bridge.
// Dedicated view modules own their routes. Do not intercept Documents here.
const handledViews = new Set(["review", "activity", "staff-access", "access-requests"]);

document.addEventListener("click", event => {
  const link = event.target.closest?.("a[data-view]");
  if (!link) return;
  const view = link.dataset.view;
  if (handledViews.has(view)) event.stopImmediatePropagation();
}, true);
