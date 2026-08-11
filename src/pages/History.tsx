import { useMemo } from "react";
import { Link } from "react-router-dom";
import * as XLSX from "xlsx";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useHistory, summarizeByDay, type DaySummary } from "@/hooks/useHistory";
import { useProfile } from "@/hooks/useProfile";
import { ArrowLeft, Loader2, Flame, TrendingUp, Download } from "lucide-react";
import { cn } from "@/lib/utils";

const DAYS = 7;

export default function History() {
  const { data: profile } = useProfile();
  const { data: logs = [], isLoading } = useHistory(DAYS);

  const target = profile?.target_calories
    ? {
        kcal: Number(profile.target_calories),
        protein_g: Number(profile.target_protein_g ?? 0),
        carbs_g: Number(profile.target_carbs_g ?? 0),
        fat_g: Number(profile.target_fat_g ?? 0),
      }
    : null;

  const days = useMemo(() => summarizeByDay(logs, DAYS), [logs]);

  const loggedDays = days.filter((d) => d.meals > 0);
  const avgKcal =
    loggedDays.length > 0
      ? Math.round(loggedDays.reduce((a, d) => a + d.kcal, 0) / loggedDays.length)
      : 0;
  const avgProtein =
    loggedDays.length > 0
      ? Math.round(loggedDays.reduce((a, d) => a + d.protein_g, 0) / loggedDays.length)
      : 0;

  // Streak: consecutive days from today going back with meals > 0
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].meals > 0) streak++;
    else break;
  }

  const maxKcalScale = Math.max(
    target?.kcal ?? 0,
    ...days.map((d) => d.kcal),
    1,
  );

  const handleExport = () => {
    const rows = days.map((d) => ({
      Date: d.date,
      Calories: Math.round(d.kcal),
      "Protein (g)": Math.round(d.protein_g),
      "Carbs (g)": Math.round(d.carbs_g),
      "Fat (g)": Math.round(d.fat_g),
      Meals: d.meals,
      Ingredients: d.ingredients,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 12 }, { wch: 10 }, { wch: 11 }, { wch: 10 }, { wch: 9 }, { wch: 7 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Daily summary");

    const mealRows = [...logs]
      .sort((a, b) => a.logged_at.localeCompare(b.logged_at))
      .map((l) => ({
        Date: l.log_date,
        Meal: l.recipe_name,
        Slot: l.slot ?? "",
        Calories: Math.round(Number(l.kcal)),
        "Protein (g)": Math.round(Number(l.protein_g)),
        "Carbs (g)": Math.round(Number(l.carbs_g)),
        "Fat (g)": Math.round(Number(l.fat_g)),
        "Total (g)": Math.round(Number(l.total_grams)),
        Ingredients: Array.isArray(l.ingredients_json) ? l.ingredients_json.length : 0,
      }));
    const ws2 = XLSX.utils.json_to_sheet(mealRows);
    ws2["!cols"] = [{ wch: 12 }, { wch: 26 }, { wch: 10 }, { wch: 10 }, { wch: 11 }, { wch: 10 }, { wch: 9 }, { wch: 10 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws2, "Meals");

    XLSX.writeFile(wb, `macro-history-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-8 md:py-12">
        <header className="mb-8">
          <Link to="/" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Your week</p>
              <h1 className="font-display text-4xl font-bold md:text-5xl">History</h1>
              <p className="mt-2 text-muted-foreground">
                Last {DAYS} days of meals and macro adherence.
              </p>
            </div>
            <Button variant="outline" onClick={handleExport} disabled={isLoading}>
              <Download className="mr-2 h-4 w-4" /> Export data
            </Button>
          </div>
        </header>

        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="mb-4 grid grid-cols-3 gap-3">
              <StatCard
                icon={<Flame className="h-4 w-4" />}
                label="Streak"
                value={streak}
                sub={streak === 1 ? "day" : "days"}
              />
              <StatCard
                icon={<TrendingUp className="h-4 w-4" />}
                label="Avg kcal"
                value={avgKcal}
                sub={target ? `of ${target.kcal}` : undefined}
              />
              <StatCard
                icon={<TrendingUp className="h-4 w-4" />}
                label="Avg protein"
                value={`${avgProtein}g`}
                sub={target ? `of ${target.protein_g}g` : undefined}
              />
            </div>

            <Card className="rounded-2xl p-6 shadow-soft md:p-8">
              <h2 className="mb-4 font-display text-lg font-bold">Calories per day</h2>
              <div className="flex h-48 items-end justify-between gap-2">
                {days.map((d) => (
                  <DayBar
                    key={d.date}
                    day={d}
                    targetKcal={target?.kcal ?? null}
                    scale={maxKcalScale}
                  />
                ))}
              </div>
            </Card>

            <section className="mt-8">
              <h2 className="mb-3 font-display text-xl font-bold">Daily breakdown</h2>
              <div className="space-y-2">
                {[...days].reverse().map((d) => (
                  <DayRow key={d.date} day={d} target={target} />
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <Card className="rounded-2xl p-4">
      <div className="mb-1 flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
        {icon} {label}
      </div>
      <div className="font-display text-2xl font-bold tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </Card>
  );
}

function DayBar({
  day,
  targetKcal,
  scale,
}: {
  day: DaySummary;
  targetKcal: number | null;
  scale: number;
}) {
  const heightPct = Math.min(100, (day.kcal / scale) * 100);
  const targetPct = targetKcal ? Math.min(100, (targetKcal / scale) * 100) : null;
  const onTarget =
    targetKcal && day.kcal > 0
      ? Math.abs(day.kcal - targetKcal) / targetKcal <= 0.1
      : false;
  const date = new Date(day.date + "T00:00:00");
  const isToday = day.date === new Date().toISOString().slice(0, 10);
  const dayLabel = date.toLocaleDateString(undefined, { weekday: "short" });

  return (
    <div className="flex flex-1 flex-col items-center gap-1.5">
      <div className="text-[10px] tabular-nums text-muted-foreground">
        {day.meals > 0 ? Math.round(day.kcal) : "–"}
      </div>
      <div className="relative flex h-36 w-full items-end overflow-hidden rounded-md bg-secondary">
        {targetPct !== null && (
          <div
            className="absolute left-0 right-0 border-t border-dashed border-foreground/40"
            style={{ bottom: `${targetPct}%` }}
          />
        )}
        <div
          className={cn(
            "w-full transition-all",
            day.meals === 0
              ? "bg-muted"
              : onTarget
                ? "bg-primary"
                : "bg-primary/60",
          )}
          style={{ height: `${heightPct}%` }}
        />
      </div>
      <div className={cn("text-[11px] font-medium", isToday && "text-primary")}>
        {dayLabel}
      </div>
    </div>
  );
}

function DayRow({
  day,
  target,
}: {
  day: DaySummary;
  target: { kcal: number; protein_g: number; carbs_g: number; fat_g: number } | null;
}) {
  const date = new Date(day.date + "T00:00:00");
  const isToday = day.date === new Date().toISOString().slice(0, 10);
  const label = isToday
    ? "Today"
    : date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });

  if (day.meals === 0) {
    return (
      <Card className="flex items-center justify-between rounded-xl p-4 opacity-60">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">No meals logged</div>
      </Card>
    );
  }

  const pct = target ? Math.round((day.kcal / target.kcal) * 100) : null;

  return (
    <Card className="rounded-xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">{label}</div>
          <div className="text-xs text-muted-foreground">
            {day.meals} {day.meals === 1 ? "meal" : "meals"}
          </div>
        </div>
        <div className="text-right">
          <div className="font-display text-lg font-bold tabular-nums">
            {Math.round(day.kcal)} kcal
          </div>
          {pct !== null && (
            <div className="text-[11px] text-muted-foreground">{pct}% of target</div>
          )}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
        <Macro label="P" value={day.protein_g} target={target?.protein_g} />
        <Macro label="C" value={day.carbs_g} target={target?.carbs_g} />
        <Macro label="F" value={day.fat_g} target={target?.fat_g} />
      </div>
    </Card>
  );
}

function Macro({ label, value, target }: { label: string; value: number; target?: number }) {
  return (
    <div className="rounded-md bg-secondary py-1.5">
      <span className="text-muted-foreground">{label} </span>
      <span className="font-medium tabular-nums">{Math.round(value)}g</span>
      {target ? <span className="text-muted-foreground"> / {Math.round(target)}</span> : null}
    </div>
  );
}
