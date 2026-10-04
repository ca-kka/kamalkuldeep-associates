import { supabase } from './config.js';

/**
 * Admin bootstrap.
 *
 * Authentication/session are the critical path. Feature modules are isolated so
 * one optional admin module failing cannot prevent the rest of the portal from booting.
 */

const featureModules = [
  './admin-shell.js',
  './admin-dashboard.js',
  './admin-client-management.js',
  './admin-document-management.js',
  './documents-browser.js',
  './document-uploader.js',
  './review-queue.js',
  './audit-trail.js',
  './staff-access.js',
  './portal-access-admin.js',
  './storage.js',
  './onedrive-directory.js',
  './onedrive-sync.js',
  './system-diagnostics.js',
  './diagnostic-logger.js',
  './mobile-menu.js',
  './theme.js',
  './app.js'
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
    if (!session) {
      window.location.replace('/admin/login.html');
      return;
    }

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('role, is_active')
      .eq('id', session.user.id)
      .maybeSingle();

    if (error) throw error;

    const allowed = ['admin', 'staff'];
    if (!profile?.is_active || !allowed.includes(profile.role)) {
      await supabase.auth.signOut();
      window.location.replace('/admin/login.html?error=unauthorized');
      return;
    }

    // Critical auth/session checks have passed. Feature modules are intentionally
    // isolated: one broken feature must not take down the admin shell.
    await Promise.all(featureModules.map(loadFeatureModule));

    window.dispatchEvent(new CustomEvent('kka:admin-ready', {
      detail: { userId: session.user.id, role: profile.role }
    }));
  } catch (error) {
    console.error('[Admin] Critical bootstrap failure', error);
    window.location.replace('/admin/login.html?error=portal');
  }
}

boot();
