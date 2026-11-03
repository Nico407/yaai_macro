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
        <header className="mb-6 text-foreground">
          <p className="mb-2 text-sm uppercase tracking-[0.2em] opacity-80">Welcome</p>
          <h1 className="font-display text-4xl font-bold md:text-5xl">
            {mode === "signin" ? "Sign in" : "Create your account"}
          </h1>
        </header>

        <Card className="rounded-2xl p-6 shadow-elevated md:p-8">
          <Button type="button" variant="outline" className="w-full" disabled={busy} onClick={onGoogle}>
            <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
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
              <Input id="password" type="password" required minLength={mode === "signup" ? 8 : 6} value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1.5" />
              {mode === "signup" && (
                <ul className="mt-2 space-y-1 text-xs">
                  {PW_RULES.map((rule) => {
                    const ok = rule.test(password);
                    return (
                      <li key={rule.label} className={`flex items-center gap-1.5 ${ok ? "text-accent" : "text-destructive"}`}>
                        {ok ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                        <span>{rule.label}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
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
        <p className="mt-4 text-center text-xs text-muted-foreground">
          By continuing you agree your data is handled per our privacy terms.
        </p>
      </div>
    </div>
  );
}
