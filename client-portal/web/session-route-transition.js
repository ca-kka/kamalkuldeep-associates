/* Prevent the legacy browser-session marker from logging out a valid user when
 * navigating between the isolated /, /client/ and /admin/ portal entrypoints.
 * The legacy marker is still retained for same-route browser-close detection. */
const currentRoute=(location.pathname.match(/\/client\/?$|\/admin\/?$/)?.[0]||"/").replace(/\/+$/,"/");
const LAST_ROUTE_KEY="kka-last-portal-route";
const LEGACY_MARKER="kka-browser-session";
try {
  const previousRoute=localStorage.getItem(LAST_ROUTE_KEY);
  if (previousRoute && previousRoute !== currentRoute) localStorage.removeItem(LEGACY_MARKER);
  localStorage.setItem(LAST_ROUTE_KEY,currentRoute);
} catch {}
