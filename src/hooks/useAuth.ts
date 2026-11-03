import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

// Set only on the Pi (VITE_AUTO_LOGIN_EMAIL / _PASSWORD in .env.local, never committed). There the app is
// reachable over Tailscale only, so it signs in by itself and the login page is skipped.
const AUTO_EMAIL = import.meta.env.VITE_AUTO_LOGIN_EMAIL as string | undefined;
const AUTO_PASSWORD = import.meta.env.VITE_AUTO_LOGIN_PASSWORD as string | undefined;

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Set up listener BEFORE getSession (per Supabase guidance)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
    });
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      let s = session;
      if (!s && AUTO_EMAIL && AUTO_PASSWORD) {
        const { data, error } = await supabase.auth.signInWithPassword({ email: AUTO_EMAIL, password: AUTO_PASSWORD });
        if (error) console.error("Auto-login failed:", error.message);
        s = data.session;
      }
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  return { session, user, loading };
}

export async function requireUserId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  return user.id;
}
