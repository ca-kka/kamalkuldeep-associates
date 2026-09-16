import { createClient as createSupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

const supabase = createSupabaseClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const path = window.location.pathname.replace(/\/+$/, "") || "/";
const route = path.endsWith("/client") ? "client" : path.endsWith("/admin") ? "admin" : "root";
let redirecting = false;

async function enforceRoute() {
  if (redirecting) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role,active")
    .eq("id", user.id)
    .maybeSingle();

  if (error || profile?.active === false) return;
  const role = profile?.role;
  const destination = role === "client" ? "../client/" : ["admin", "staff"].includes(role) ? "../admin/" : null;
  if (!destination) return;

  const currentIsCorrect = route === "client" ? role === "client" : route === "admin" ? ["admin", "staff"].includes(role) : false;
  if (currentIsCorrect) return;

  redirecting = true;
  window.location.replace(destination);
}

void enforceRoute();
supabase.auth.onAuthStateChange((event, session) => {
  if (session?.user && ["SIGNED_IN", "INITIAL_SESSION"].includes(event)) void enforceRoute();
});
