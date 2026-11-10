import { useMemo, useState } from "react";
import { Droplets, Scale, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useBodyActions, useBodyRows, weightsByDay, rollingAverage } from "@/hooks/useBody";
import { useProfile } from "@/hooks/useProfile";
import { localDateISO } from "@/lib/dates";
import { cn } from "@/lib/utils";

const STEPS = [250, 500, 1000];

/** Today page: water against the goal with +250 / +500 / +1000 ml, and today's weigh-in (or the latest one). */
export function BodyCard() {
  const { data: rows = [] } = useBodyRows(30);
  const { data: profile } = useProfile();
  const actions = useBodyActions();
  const [busy, setBusy] = useState(false);
  const [kg, setKg] = useState("");
  const today = localDateISO();
  const goal = Number((profile as { water_goal_ml?: number | null } | null | undefined)?.water_goal_ml) || 2500;
  const water = rows.filter((r) => r.metric === "water" && r.day === today).reduce((a, r) => a + Number(r.value), 0);
  const trend = useMemo(() => rollingAverage(weightsByDay(rows)), [rows]);
  const last = trend[trend.length - 1];
  const weighedToday = last?.day === today;

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast.error("Couldn't save", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const saveWeight = () => {
    const v = Number(kg.replace(",", "."));
    if (!(v >= 30 && v <= 300)) return toast.error("That doesn't look like a weight in kg");
    run(async () => { await actions.add("weight", v); setKg(""); toast.success(`${v} kg logged`); });
  };

  return (
    <Card className="mt-4 grid gap-4 rounded-2xl p-4 sm:grid-cols-[1fr_auto] md:mt-6 md:p-5">
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <p className="flex items-center gap-1.5 text-sm font-semibold"><Droplets className="h-4 w-4 text-sky-400" /> Water</p>
          <p className="text-sm tabular-nums">
            <span className="font-semibold">{(water / 1000).toFixed(2).replace(/0$/, "")}</span>
            <span className="text-muted-foreground"> / {(goal / 1000).toFixed(1)} L</span>
          </p>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary">
          <div className="h-full rounded-full bg-sky-400 transition-[width] duration-300" style={{ width: `${Math.min(100, (water / goal) * 100)}%` }} />
        </div>
        <div className="mt-3 flex gap-2">
          {STEPS.map((ml) => (
            <button key={ml} type="button" disabled={busy} onClick={() => run(() => actions.add("water", ml))}
              className="flex-1 rounded-lg border border-border py-1.5 text-xs font-medium tabular-nums transition-colors hover:border-sky-400/60 hover:text-sky-500 disabled:opacity-50">
              +{ml} ml
            </button>
          ))}
          <button type="button" disabled={busy} aria-label="Remove today's last water entry" title="Remove today's last water entry"
            onClick={() => run(async () => { const ml = await actions.undoWater(); toast(ml ? `Removed ${ml} ml` : "Nothing to undo today"); })}
            className="rounded-lg border border-border px-2.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50">
            <Undo2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="flex items-center gap-3 border-t border-border pt-3 sm:min-w-44 sm:flex-col sm:items-start sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
        <p className="flex items-center gap-1.5 text-sm font-semibold"><Scale className="h-4 w-4 text-primary" /> Weight</p>
        {weighedToday ? (
          <p className="text-sm tabular-nums">
            <span className="font-semibold">{last.kg} kg</span>
            <span className="text-muted-foreground"> · 7-day {last.avg}</span>
          </p>
        ) : (
          <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); saveWeight(); }}>
            <Input value={kg} onChange={(e) => setKg(e.target.value)} inputMode="decimal" placeholder={last ? String(last.kg) : "kg"}
              aria-label="Today's weight in kg" className="h-8 w-20 tabular-nums" />
            <button type="submit" disabled={busy || !kg}
              className={cn("rounded-lg border border-border px-2.5 py-1 text-xs font-medium transition-colors",
                kg ? "hover:border-primary hover:text-primary" : "opacity-50")}>
              Log
            </button>
          </form>
        )}
      </div>
    </Card>
  );
}
