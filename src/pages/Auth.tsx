import { useEffect, useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/hooks/useAuth";
import { Check, Loader2, X } from "lucide-react";

const PW_RULES = [
  { label: "At least one number", test: (p: string) => /\d/.test(p) },
  { label: "At least one uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
  { label: "At least one special character", test: (p: string) => /[^A-Za-z0-9]/.test(p) },
  { label: "At least 8 characters", test: (p: string) => p.length >= 8 },
];

export default function Auth() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/main";

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { document.title = mode === "signin" ? "Sign in" : "Create account"; }, [mode]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (user) return <Navigate to={from} replace />;

  async function onEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "signup" && !PW_RULES.every((r) => r.test(password))) {
      toast({ title: "Password too weak", description: "Please meet all password requirements.", variant: "destructive" });
      return;
    }
    setBusy(true);
    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/main` },
      });
      setBusy(false);
      if (error) {
        toast({ title: "Couldn't sign up", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "Account created", description: "You're signed in." });
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setBusy(false);
      if (error) {
        toast({ title: "Couldn't sign in", description: error.message, variant: "destructive" });
        return;
      }
    }
  }

  async function onGoogle() {
    setBusy(true);
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/main" });
    if (result.error) {
      setBusy(false);
      toast({ title: "Google sign-in failed", description: String(result.error), variant: "destructive" });
    }
    // if redirected, browser will navigate
  }

  return (
    <div className="min-h-screen bg-gradient-hero">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
        <header className="mb-6 text-primary-foreground">
          <p className="mb-2 text-sm uppercase tracking-[0.2em] opacity-80">Welcome</p>
          <h1 className="font-display text-4xl font-bold md:text-5xl">
            {mode === "signin" ? "Sign in" : "Create your account"}
          </h1>
        </header>

        <Card className="rounded-2xl p-6 shadow-elevated md:p-8">
          <Button type="button" variant="outline" className="w-full" disabled={busy} onClick={onGoogle}>
            Continue with Google
          </Button>
          <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
          </div>
          <form onSubmit={onEmailSubmit} className="space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1.5" />
            </div>
            <Button type="submit" size="lg" className="w-full" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            {mode === "signin" ? (
              <>No account?{" "}
                <button type="button" onClick={() => setMode("signup")} className="font-semibold text-primary underline">Create one</button>
              </>
            ) : (
              <>Already have an account?{" "}
                <button type="button" onClick={() => setMode("signin")} className="font-semibold text-primary underline">Sign in</button>
              </>
            )}
          </p>
        </Card>
        <p className="mt-4 text-center text-xs text-primary-foreground/70">
          By continuing you agree your data is handled per our privacy terms.
        </p>
      </div>
    </div>
  );
}
