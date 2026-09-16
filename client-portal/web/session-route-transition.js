/* Isolated portal transition guard. Client and Admin maintain separate browser-session state. */
const path=location.pathname.replace(/\/+$/,'')||'/';
const currentRoute=path.endsWith('/client')?'/client/':path.endsWith('/admin')?'/admin/':'/';
const LAST_ROUTE_KEY='kka-last-portal-route';
const LEGACY_MARKER='kka-browser-session';
const routeMarker=currentRoute==='/client/'?'kka-browser-session:client':currentRoute==='/admin/'?'kka-browser-session:admin':null;
try{
  const previousRoute=localStorage.getItem(LAST_ROUTE_KEY);
  if(previousRoute&&previousRoute!==currentRoute){
    localStorage.removeItem(LEGACY_MARKER);
    if(previousRoute==='/client/')localStorage.removeItem('kka-browser-session:client');
    if(previousRoute==='/admin/')localStorage.removeItem('kka-browser-session:admin');
  }
  if(routeMarker)localStorage.removeItem(routeMarker);
  localStorage.setItem(LAST_ROUTE_KEY,currentRoute);
}catch{}
