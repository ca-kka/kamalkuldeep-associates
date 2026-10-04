import { supabase } from './config.js';

/**
 * Admin bootstrap.
 * Authentication/session are the critical path. Feature modules are isolated so
 * one optional admin module failing cannot prevent the admin shell from booting.
 */
const featureModules = [
  './admin-shell.js', './admin-dashboard.js', './admin-client-management.js',
  './admin-document-management.js', './documents-browser.js', './document-uploader.js',
  './review-queue.js', './audit-trail.js', './staff-access.js', './portal-access-admin.js',
  './storage.js', './onedrive-directory.js', './onedrive-sync.js',
  './system-diagnostics.js', './diagnostic-logger.js', './mobile-menu.js', './theme.js', './app.js'
];

async function loadFeatureModule(path) {
  try {
    await import(path);
    return true;
  } catch (error) {
    console.error(`[Admin] Optional module failed to load: ${path}`, error);
    return false;
  }
}

async function boot() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return window.location.replace('/admin/login.html');

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('role, is_active')
      .eq('id', session.user.id)
      .maybeSingle();
    if (error) throw error;

    if (!profile?.is_active || !['admin', 'staff'].includes(profile.role)) {
      await supabase.auth.signOut();
      return window.location.replace('/admin/login.html?error=unauthorized');
    }

    // Keep the established module order, but isolate each module failure.
    for (const path of featureModules) {
      await loadFeatureModule(path);
    }

    window.dispatchEvent(new CustomEvent('kka:admin-ready', {
      detail: { userId: session.user.id, role: profile.role }
    }));
  } catch (error) {
    console.error('[Admin] Critical bootstrap failure', error);
    window.location.replace('/admin/login.html?error=portal');
  }
}

boot();
