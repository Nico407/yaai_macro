import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  calcTargets,
  type ActivityLevel,
  type Goal,
  type Sex,
} from "@/lib/macros";

const ACTIVITY_OPTIONS: { value: ActivityLevel; label: string; hint: string }[] = [
  { value: "sedentary", label: "Sedentary", hint: "Desk job, no exercise" },
  { value: "light", label: "Light", hint: "1–3 workouts / week" },
  { value: "moderate", label: "Moderate", hint: "3–5 workouts / week" },
  { value: "active", label: "Active", hint: "6–7 workouts / week" },
  { value: "very_active", label: "Very active", hint: "Daily intense training" },
];

export default function Onboarding() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);

  const [displayName, setDisplayName] = useState("");
  const [age, setAge] = useState("28");
  const [sex, setSex] = useState<Sex>("male");
  const [height, setHeight] = useState("180");
  const [weight, setWeight] = useState("75");
  const [activity, setActivity] = useState<ActivityLevel>("moderate");
  const [goal, setGoal] = useState<Goal>("maintain");

  const ageNum = parseFloat(age);
  const ageError =
    age !== "" && !isNaN(ageNum) && ageNum < 13
      ? "Sorry, this app is only for ages 13 and up."
      : null;

  const preview = (() => {
    const h = parseFloat(height);
    const w = parseFloat(weight);
    if (!ageNum || !h || !w || ageError) return null;
    return calcTargets({
      age: ageNum,
      sex,
      height_cm: h,
      weight_kg: w,
      activity_level: activity,
      goal,
    });
  })();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!preview) return;
    setSaving(true);
    const { error } = await supabase.from("profile").insert({
      display_name: displayName || null,
      age: parseInt(age, 10),
      sex,
      height_cm: parseFloat(height),
      weight_kg: parseFloat(weight),
      activity_level: activity,
      goal,
      target_calories: preview.calories,
      target_protein_g: preview.protein_g,
      target_carbs_g: preview.carbs_g,
      target_fat_g: preview.fat_g,
    });
    setSaving(false);
    if (error) {
      toast({ title: "Couldn't save", description: error.message, variant: "destructive" });
      return;
    }
    await qc.invalidateQueries({ queryKey: ["profile"] });
    toast({ title: "Profile saved", description: "Your daily targets are ready." });
    navigate("/");
  }

  return (
    <div className="min-h-screen bg-gradient-hero">
      <div className="mx-auto max-w-2xl px-4 py-10 md:py-16">
        <header className="mb-8 text-primary-foreground">
          <p className="mb-2 text-sm uppercase tracking-[0.2em] opacity-80">Step 1</p>
          <h1 className="font-display text-4xl font-bold md:text-5xl">Let's calibrate.</h1>
          <p className="mt-2 opacity-80">A few numbers to compute your daily macro targets.</p>
        </header>

        <Card className="rounded-2xl p-6 shadow-elevated md:p-8">
          <form onSubmit={onSubmit} className="space-y-6">
            <div>
              <Label htmlFor="name">Name (optional)</Label>
              <Input
                id="name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Nico"
                className="mt-1.5"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="age">Age</Label>
                <Input
                  id="age"
                  type="number"
                  inputMode="numeric"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>Sex</Label>
                <RadioGroup
                  value={sex}
                  onValueChange={(v) => setSex(v as Sex)}
                  className="mt-2 flex gap-3"
                >
                  <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-lg border border-input bg-background px-3 py-2 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                    <RadioGroupItem value="male" /> <span className="text-sm">Male</span>
                  </label>
                  <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-lg border border-input bg-background px-3 py-2 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                    <RadioGroupItem value="female" /> <span className="text-sm">Female</span>
                  </label>
                </RadioGroup>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="height">Height (cm)</Label>
                <Input
                  id="height"
                  type="number"
                  inputMode="numeric"
                  value={height}
                  onChange={(e) => setHeight(e.target.value)}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="weight">Weight (kg)</Label>
                <Input
                  id="weight"
                  type="number"
                  inputMode="numeric"
                  step="0.1"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  className="mt-1.5"
                />
              </div>
            </div>

            <div>
              <Label>Activity level</Label>
              <Select value={activity} onValueChange={(v) => setActivity(v as ActivityLevel)}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACTIVITY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      <span className="font-medium">{o.label}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{o.hint}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Goal</Label>
              <RadioGroup
                value={goal}
                onValueChange={(v) => setGoal(v as Goal)}
                className="mt-2 grid grid-cols-5 gap-2"
              >
                {([
                  { v: "hard_cut", label: "Hard cut", hint: "-30%" },
                  { v: "cut", label: "Cut", hint: "-20%" },
                  { v: "maintain", label: "Maintain", hint: "0%" },
                  { v: "bulk", label: "Bulk", hint: "+15%" },
                  { v: "hard_bulk", label: "Hard bulk", hint: "+25%" },
                ] as { v: Goal; label: string; hint: string }[]).map((g) => (
                  <label
                    key={g.v}
                    className="flex cursor-pointer flex-col items-center gap-0.5 rounded-lg border border-input bg-background px-2 py-3 text-center has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                  >
                    <RadioGroupItem value={g.v} className="sr-only" />
                    <span className="text-xs font-medium leading-tight">{g.label}</span>
                    <span className="text-[10px] text-muted-foreground">{g.hint}</span>
                  </label>
                ))}
              </RadioGroup>
            </div>

            {preview && (
              <div className="rounded-xl bg-secondary p-4">
                <div className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
                  Preview — your daily targets
                </div>
                <div className="grid grid-cols-4 gap-2 text-center">
                  <Stat label="kcal" value={preview.calories} />
                  <Stat label="protein" value={`${preview.protein_g}g`} />
                  <Stat label="carbs" value={`${preview.carbs_g}g`} />
                  <Stat label="fat" value={`${preview.fat_g}g`} />
                </div>
              </div>
            )}

            <Button type="submit" size="lg" className="w-full" disabled={saving || !preview}>
              {saving ? "Saving…" : "Save and continue"}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="font-display text-xl font-bold">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}
