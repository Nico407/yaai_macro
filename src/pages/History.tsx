import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import * as XLSX from "xlsx";
import { format } from "date-fns";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  useHistory,
  summarizeByDay,
  summarizeByRange,
  type DaySummary,
} from "@/hooks/useHistory";
import { useProfile } from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";
import type { MealLog } from "@/hooks/useTodayLogs";
import {
  ArrowLeft,
  Loader2,
  Flame,
  TrendingUp,
  Download,
  CalendarIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const DAYS = 7;

type ExportMode = "7" | "30" | "year" | "all" | "range";

export default function History() {
  const { data: profile } = useProfile();
  const { data: logs = [], isLoading } = useHistory(DAYS);

  const [exportMode, setExportMode] = useState<ExportMode>("7");
  const [exportFormat, setExportFormat] = useState<"excel" | "csv">("excel");
  const [rangeStart, setRangeStart] = useState<Date | undefined>(undefined);
  const [rangeEnd, setRangeEnd] = useState<Date | undefined>(undefined);
  const [exporting, setExporting] = useState(false);

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

  const getExportRange = (mode: ExportMode) => {
    const today = format(new Date(), "yyyy-MM-dd");
    if (mode === "7") {
      const d = new Date();
      d.setDate(d.getDate() - 6);
      return { start: format(d, "yyyy-MM-dd"), end: today };
    }
    if (mode === "30") {
      const d = new Date();
      d.setDate(d.getDate() - 29);
      return { start: format(d, "yyyy-MM-dd"), end: today };
    }
    if (mode === "year") {
      const year = new Date().getFullYear();
      return { start: `${year}-01-01`, end: today };
    }
    if (mode === "all") {
      return { start: "1970-01-01", end: today };
    }
    if (mode === "range" && rangeStart && rangeEnd) {
      return {
        start: format(rangeStart, "yyyy-MM-dd"),
        end: format(rangeEnd, "yyyy-MM-dd"),
      };
    }
    return { start: today, end: today };
  };

  const handleExport = async () => {
    if (exportMode === "range" && (!rangeStart || !rangeEnd)) return;

    setExporting(true);
    try {
      const formatDate = (iso: string) => {
        const [y, m, d] = iso.split("-");
        return `${d}-${m}-${y.slice(2)}`;
      };

      const { start, end } = getExportRange(exportMode);
      const { data, error } = await supabase
        .from("meal_logs")
        .select("*")
        .gte("log_date", start)
        .lte("log_date", end)
        .order("logged_at", { ascending: false });
      if (error) throw error;
      const exportLogs = (data ?? []) as MealLog[];

      const summaryDays = summarizeByRange(exportLogs, start, end);

      const dayMeals = new Map<string, string[]>();
      exportLogs.forEach((l) => {
        const list = dayMeals.get(l.log_date) ?? [];
        list.push(l.recipe_name);
        dayMeals.set(l.log_date, list);
      });

      const rows = summaryDays.map((d) => ({
        Date: formatDate(d.date),
        Calories: Math.round(d.kcal),
        "Protein (g)": Math.round(d.protein_g),
        "Carbs (g)": Math.round(d.carbs_g),
        "Fat (g)": Math.round(d.fat_g),
        Meals: (dayMeals.get(d.date) ?? []).join(", "),
      }));
      const loggedRows = rows.filter((r) => r.Meals !== "");
      const avgCount = loggedRows.length || 1;
      const avgRow = {
        Date: "Average",
        Calories: Math.round(loggedRows.reduce((a, r) => a + r.Calories, 0) / avgCount) || 0,
        "Protein (g)": Math.round(loggedRows.reduce((a, r) => a + r["Protein (g)"], 0) / avgCount) || 0,
        "Carbs (g)": Math.round(loggedRows.reduce((a, r) => a + r["Carbs (g)"], 0) / avgCount) || 0,
        "Fat (g)": Math.round(loggedRows.reduce((a, r) => a + r["Fat (g)"], 0) / avgCount) || 0,
        Meals: "",
      };
      const rowsWithAvg = [...rows, avgRow];

      const mealRows = [...exportLogs]
        .sort((a, b) => a.logged_at.localeCompare(b.logged_at))
        .map((l) => ({
          Date: formatDate(l.log_date),
          Meal: l.recipe_name,
          Slot: l.slot ?? "",
          Calories: Math.round(Number(l.kcal)),
          "Protein (g)": Math.round(Number(l.protein_g)),
          "Carbs (g)": Math.round(Number(l.carbs_g)),
          "Fat (g)": Math.round(Number(l.fat_g)),
          "Total (g)": Math.round(Number(l.total_grams)),
        }));

      const baseFilename = `macro-history-${format(new Date(), "yyyy-MM-dd")}`;

      if (exportFormat === "csv") {
        const escapeCsv = (val: string | number) => {
          const s = String(val);
          if (/[\",\n]/.test(s)) return `"${s.replace(/"/g, "\"\"")}"`;
          return s;
        };
        const toCsv = (
          data: Record<string, string | number>[],
          headers: string[],
        ) => {
          const lines = [headers.map(escapeCsv).join(",")];
          data.forEach((r) => lines.push(headers.map((h) => escapeCsv(r[h])).join(",")));
          return lines.join("\n");
        };

        const summaryHeaders = ["Date", "Calories", "Protein (g)", "Carbs (g)", "Fat (g)", "Meals"];
        const mealHeaders = ["Date", "Meal", "Slot", "Calories", "Protein (g)", "Carbs (g)", "Fat (g)", "Total (g)"];
        const csv = [
          toCsv(rowsWithAvg, summaryHeaders),
          "",
          "Meals",
          toCsv(mealRows, mealHeaders),
        ].join("\n");

        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${baseFilename}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } else {
        const ws = XLSX.utils.json_to_sheet(rowsWithAvg);
        ws["!cols"] = [
          { wch: 12 },
          { wch: 10 },
          { wch: 11 },
          { wch: 10 },
          { wch: 9 },
          { wch: 40 },
        ];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Daily summary");

        const ws2 = XLSX.utils.json_to_sheet(mealRows);
        ws2["!cols"] = [
          { wch: 12 },
          { wch: 26 },
          { wch: 10 },
          { wch: 10 },
          { wch: 11 },
          { wch: 10 },
          { wch: 9 },
          { wch: 10 },
        ];
        XLSX.utils.book_append_sheet(wb, ws2, "Meals");

        XLSX.writeFile(wb, `${baseFilename}.xlsx`);
      }
    } finally {
      setExporting(false);
    }
  };

  const rangeLabel = (mode: ExportMode) => {
    switch (mode) {
      case "7":
        return "Last 7 days";
      case "30":
        return "Last 30 days";
      case "year":
        return "Current year";
      case "all":
        return "All";
      case "range":
        return "Custom range";
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-8 md:py-12">
        <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link
              to="/"
              className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </Link>
            <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Your week</p>
            <h1 className="font-display text-4xl font-bold md:text-5xl">History</h1>
            <p className="mt-2 text-muted-foreground">
              Last {DAYS} days of meals and macro adherence.
            </p>
          </div>

          <Card className="rounded-2xl p-4 md:w-72">
            <h2 className="mb-3 font-display text-base font-bold">Export data</h2>
            <div className="space-y-3">
              <div>
                <Label htmlFor="export-range" className="text-xs">Time frame</Label>
                <Select value={exportMode} onValueChange={(v) => setExportMode(v as ExportMode)}>
                  <SelectTrigger id="export-range" className="mt-1 w-full text-xs">
                    <SelectValue placeholder="Select range" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">Last 7 days</SelectItem>
                    <SelectItem value="30">Last 30 days</SelectItem>
                    <SelectItem value="year">Current year</SelectItem>
                    <SelectItem value="all">All time</SelectItem>
                    <SelectItem value="range">Custom range</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="export-format" className="text-xs">Format</Label>
                <Select value={exportFormat} onValueChange={(v) => setExportFormat(v as "excel" | "csv")}>
                  <SelectTrigger id="export-format" className="mt-1 w-full text-xs">
                    <SelectValue placeholder="Select format" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="excel">Excel (.xlsx)</SelectItem>
                    <SelectItem value="csv">CSV (.csv)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {exportMode === "range" && (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div>
                    <Label className="mb-1 block text-xs">From</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className={cn(
                            "w-full justify-start text-left font-normal text-xs",
                            !rangeStart && "text-muted-foreground",
                          )}
                        >
                          <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                          {rangeStart ? format(rangeStart, "PP") : "Pick a date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={rangeStart}
                          onSelect={setRangeStart}
                          initialFocus
                          className="p-3 pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div>
                    <Label className="mb-1 block text-xs">To</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className={cn(
                            "w-full justify-start text-left font-normal text-xs",
                            !rangeEnd && "text-muted-foreground",
                          )}
                        >
                          <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                          {rangeEnd ? format(rangeEnd, "PP") : "Pick a date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={rangeEnd}
                          onSelect={setRangeEnd}
                          initialFocus
                          className="p-3 pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between gap-3 pt-1">
                <p className="text-[11px] text-muted-foreground">
                  Exporting: <span className="font-medium text-foreground">{rangeLabel(exportMode)}</span>
                </p>
                <Button
                  size="sm"
                  onClick={handleExport}
                  disabled={isLoading || exporting || (exportMode === "range" && (!rangeStart || !rangeEnd))}
                >
                  {exporting ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Export
                </Button>
              </div>
            </div>
          </Card>
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
  const isToday = day.date === format(new Date(), "yyyy-MM-dd");
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
            day.meals === 0 ? "bg-muted" : onTarget ? "bg-primary" : "bg-primary/60",
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
  const isToday = day.date === format(new Date(), "yyyy-MM-dd");
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
