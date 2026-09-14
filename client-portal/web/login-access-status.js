import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const INACTIVE_MESSAGE = "Login inactive. Kindly contact KKA for assistance.";

function showInactiveMessage() {
  const apply = () => {
    const message = document.querySelector("#auth-message");
    if (!message) return false;
    message.className = "message login-inactive";
    message.innerHTML = `<strong>Login inactive</strong><br>${INACTIVE_MESSAGE}`;
    return true;
  };
  if (!apply()) setTimeout(apply, 50);
  setTimeout(apply, 250);
}

async function checkClientAccess(user) {
  if (!user) return false;
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role,active")
    .eq("id", user.id)
    .maybeSingle();

  if (error || profile?.role !== "client" || profile.active !== false) return false;

  try { sessionStorage.setItem("kka-login-inactive", "1"); } catch (_) {}
  await supabase.auth.signOut().catch(() => {});
  showInactiveMessage();
  return true;
}

function restoreInactiveMessage() {
  let pending = false;
  try { pending = sessionStorage.getItem("kka-login-inactive") === "1"; } catch (_) {}
  if (!pending) return;
  try { sessionStorage.removeItem("kka-login-inactive"); } catch (_) {}
  showInactiveMessage();
}

supabase.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_IN" && session?.user) void checkClientAccess(session.user);
});

restoreInactiveMessage();
