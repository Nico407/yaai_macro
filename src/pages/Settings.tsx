import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "de", label: "Deutsch" },
  { value: "es", label: "Español" },
  { value: "fr", label: "Français" },
  { value: "it", label: "Italiano" },
];

export default function Settings() {
  const navigate = useNavigate();
  const [language, setLanguage] = useState<string>(() => localStorage.getItem("app_language") ?? "en");
  const [deleting, setDeleting] = useState(false);

  function onLanguageChange(value: string) {
    setLanguage(value);
    localStorage.setItem("app_language", value);
    toast({ title: "Language preference saved", description: "Translation will be applied in a future update." });
  }

  async function onDeleteAccount() {
    setDeleting(true);
    const { data, error } = await supabase.functions.invoke("delete-account");
    if (error || (data as { error?: string })?.error) {
      setDeleting(false);
      toast({ title: "Couldn't delete account", description: error?.message ?? (data as { error?: string })?.error ?? "Try again", variant: "destructive" });
      return;
    }
    await supabase.auth.signOut();
    toast({ title: "Account deleted" });
    navigate("/auth", { replace: true });
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 py-8 md:py-12">
        <header className="mb-8">
          <Link to="/main" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
          <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Preferences</p>
          <h1 className="font-display text-4xl font-bold md:text-5xl">Settings</h1>
        </header>

        <Card className="rounded-2xl p-6 shadow-soft md:p-8">
          <h2 className="font-display text-lg font-bold">Language</h2>
          <p className="mt-1 text-sm text-muted-foreground">Choose your preferred language.</p>
          <div className="mt-4 max-w-xs">
            <Label htmlFor="language" className="sr-only">Language</Label>
            <Select value={language} onValueChange={onLanguageChange}>
              <SelectTrigger id="language">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((l) => (
                  <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </Card>

        <Card className="mt-6 rounded-2xl border-destructive/30 p-6 shadow-soft md:p-8">
          <h2 className="font-display text-lg font-bold text-destructive">Danger zone</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Permanently delete your account, profile, recipes, and meal history. This cannot be undone.
          </p>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" className="mt-4" disabled={deleting}>
                {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                Delete account
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                <AlertDialogDescription>
                  All your data — profile, recipes, and meal logs — will be permanently removed. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onDeleteAccount} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Yes, delete everything
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </Card>
      </div>
    </div>
  );
}
