const files = [
  "./storage-view.js?v=20261004-issues29b",
  "./storage-monitor.js?v=20261004-issues29b",
  "./document-uploader.js?v=20261004-issues29b",
  "./filing-structure-uploader.js?v=20261005-filing-subfolder-fix",
  "./documents-browser.js?v=20261004-issues29b",
  "./onedrive-browser.js?v=20261004-issues29b",
  "./review-queue.js?v=20261004-issues29b",
  "./pan-assessment.js?v=20261004-issues29b",
  "./audit-trail.js?v=20261004-issues29b",
  "./client-table-search.js?v=20261004-issues29b",
  "./admin-portal-feedback.js?v=20261004-issues29b"
];

const loadScript = src => new Promise((resolve, reject) => {
  const script = document.createElement("script");
  script.type = "module";
  script.src = src;
  script.onload = resolve;
  script.onerror = () => reject(new Error(`Could not load ${src}`));
  document.head.appendChild(script);
});

window.KKALoadAdminModules = async function(){
  for(const src of files) await loadScript(src);
};
