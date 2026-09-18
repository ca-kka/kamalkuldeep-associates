/* Portal route transition helper. Session lifetime is owned by session-security.js. */
const path=location.pathname.replace(/\/+$/,"")||"/";
const currentRoute=path.endsWith("/client")?"/client/":path.endsWith("/admin")?"/admin/":"/";
try{localStorage.setItem("kka-last-portal-route",currentRoute)}catch{}
