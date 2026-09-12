/* Client dashboard ownership moved to client-dashboard.js.
   Kept as a compatibility module so existing index wiring remains safe.
   It intentionally does not render or query documents. */
const notify=()=>window.dispatchEvent(new CustomEvent("kka-family-dashboard-ready"));
window.addEventListener("kka-family-profile-change",notify);
window.addEventListener("kka-family-profile-refresh",notify);
