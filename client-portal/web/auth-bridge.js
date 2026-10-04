import { supabase } from './config.js';

/**
 * Client bootstrap.
 *
 * Authentication/session are the critical path. Feature modules are isolated so
 * one optional module failing cannot prevent the rest of the portal from booting.
 */

const featureModules = [
  './session-security.js',
  './session-settings.js',
  './client-dashboard.js',
  './family-management.js',
  './client-document-access.js',
  './document-uploader.js',
  './client-profile-menu.js',
  './client-profile-sync.js',
  './mobile-menu.js',
  './feedback.js',
  './session-logout.js',
  './app.js'
];

async function loadFeatureModule(path) {
  try {
    await import(path);
    return true;
  } catch (error) {
    console.error(`[Client] Optional module failed to load: ${path}`, error);
    return false;
  }
}

async function boot() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      window.location.replace('/client/login.html');
      return;
    }

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('role, must_change_password, is_active')
      .eq('id', session.user.id)
      .maybeSingle();

    if (error) throw error;
    if (!profile?.is_active) {
      await supabase.auth.signOut();
      window.location.replace('/client/login.html?error=inactive');
      return;
    }

    if (profile.must_change_password) {
      window.location.replace('/client/change-password.html');
      return;
    }

    // Critical auth/session checks have passed. From this point onward, feature
    // modules are intentionally isolated: one broken feature must not break the shell.
    await Promise.all(featureModules.map(loadFeatureModule));

    window.dispatchEvent(new CustomEvent('kka:client-ready', {
      detail: { userId: session.user.id }
    }));
  } catch (error) {
    console.error('[Client] Critical bootstrap failure', error);
    window.location.replace('/client/login.html?error=portal');
  }
}

boot();
