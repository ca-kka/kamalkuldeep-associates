const ACTIVE_TAB_TTL_MS = 90 * 1000;
let registeredInThisDocument = null;

function newTabId() {
  return globalThis.crypto?.randomUUID?.() || `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function closeMarker(role) {
  try {
    const value = JSON.parse(localStorage.getItem(`kka-tab-closed:${role}`) || "null");
    return value && Number.isFinite(Number(value.at)) ? value : null;
  } catch {
    return null;
  }
}

function navigationType() {
  try {
    return performance.getEntriesByType("navigation")?.[0]?.type || "navigate";
  } catch {
    return "navigate";
  }
}

export function hasActivePortalTab(role, excludedTabId = null) {
  try {
    const prefix = `kka-tab-heartbeat:${role}:`;
    const close = closeMarker(role);
    const now = Date.now();

    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith(prefix)) continue;

      const id = key.slice(prefix.length);
      if (id === excludedTabId) continue;

      const timestamp = Number(localStorage.getItem(key));
      if (!Number.isFinite(timestamp) || now - timestamp < 0 || now - timestamp > ACTIVE_TAB_TTL_MS) continue;

      // Current clients mark real tab closes explicitly. Older clients also
      // used this marker for hidden tabs, so tolerate that legacy marker briefly.
      if (close?.kind === "pagehide" && close.tabId === id && timestamp <= Number(close.at)) continue;

      return true;
    }
  } catch {
    // If storage is unavailable, the normal per-tab sign-in gate remains in place.
  }
  return false;
}

export function hasActivePortalPeer(role, currentTabId) {
  return hasActivePortalTab(role, currentTabId);
}

export function registerPortalTab(role, { updateMarker = true } = {}) {
  try {
    const idKey = `kka-tab-id:${role}`;
    const markerKey = `kka-tab-session:${role}`;
    const pathKey = `kka-tab-last-path:${role}`;
    const heartbeatPrefix = `kka-tab-heartbeat:${role}:`;
    const path = location.pathname;
    let id = sessionStorage.getItem(idKey);
    const previousPath = sessionStorage.getItem(pathKey);

    // Edge may copy sessionStorage when a tab is duplicated. Give that new
    // browsing context its own heartbeat while preserving the copied auth.
    if (id && id !== registeredInThisDocument && previousPath === path && navigationType() === "navigate") {
      const previousHeartbeat = Number(localStorage.getItem(heartbeatPrefix + id) || 0);
      if (previousHeartbeat && Date.now() - previousHeartbeat <= ACTIVE_TAB_TTL_MS) id = newTabId();
    }

    if (!id) id = newTabId();
    sessionStorage.setItem(idKey, id);
    sessionStorage.setItem(pathKey, path);
    registeredInThisDocument = id;

    if (updateMarker || !sessionStorage.getItem(markerKey)) {
      sessionStorage.setItem(markerKey, String(Date.now()));
    }

    localStorage.setItem(heartbeatPrefix + id, String(Date.now()));
    return id;
  } catch {
    if (updateMarker) {
      try { sessionStorage.setItem(`kka-tab-session:${role}`, String(Date.now())); } catch {}
    }
    return null;
  }
}
