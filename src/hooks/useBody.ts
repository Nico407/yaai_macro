import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { localDateISO } from "@/lib/dates";

// Body log (body_metrics): weigh-ins and water. Append-only, the same rows YAAI writes from Telegram and the Hub.
// Weight: the day's first reading counts (the morning weigh-in). Water: the day's readings add up.

export type BodyRow = { id: string; measured_at: string; day: string; metric: "weight" | "water"; value: number };

const db = supabase as unknown as { from: (t: string) => any };

/** {day: the day's first weight}. Pure. */
export function weightsByDay(rows: Pick<BodyRow, "day" | "measured_at" | "value" | "metric">[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of [...rows].filter((r) => r.metric === "weight").sort((a, b) => a.measured_at.localeCompare(b.measured_at))) {
    if (!(r.day in out)) out[r.day] = Number(r.value);
  }
  return out;
}

/** The 7-day average up to each day that has a weigh-in (for the trend line). Pure. */
export function rollingAverage(byDay: Record<string, number>, days = 7): { day: string; kg: number; avg: number }[] {
  const keys = Object.keys(byDay).sort();
  return keys.map((day) => {
    const end = new Date(day + "T12:00:00");
    const start = new Date(end.getTime() - (days - 1) * 86400000).toISOString().slice(0, 10);
    const vals = keys.filter((k) => k >= start && k <= day).map((k) => byDay[k]);
    return { day, kg: byDay[day], avg: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 };
  });
}

/** Body rows since a day (default: 90 days back). */
export function useBodyRows(sinceDays = 90) {
  const since = localDateISO(new Date(Date.now() - sinceDays * 86400000));
  return useQuery({
    queryKey: ["body_metrics", since],
    refetchInterval: 15000,                     // a glass logged on Telegram shows up here
    queryFn: async () => {
      const { data, error } = await db.from("body_metrics").select("id,measured_at,day,metric,value")
        .gte("day", since).order("measured_at");
      if (error) throw error;
      return (data ?? []) as BodyRow[];
    },
  });
}

export function useBodyActions() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["body_metrics"] });
  return {
    async add(metric: "weight" | "water", value: number) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sign in required");
      const { error } = await db.from("body_metrics").insert({
        user_id: user.id, metric, value, unit: metric === "weight" ? "kg" : "ml", source: "app",
        measured_at: new Date().toISOString(), day: localDateISO(),
      });
      if (error) throw new Error(error.message);
      await refresh();
    },
    /** today's newest water entry; returns the ml removed (0 if none) */
    async undoWater(): Promise<number> {
      const { data, error } = await db.from("body_metrics").select("id,value").eq("metric", "water")
        .eq("day", localDateISO()).order("measured_at", { ascending: false }).limit(1);
      if (error) throw new Error(error.message);
      if (!data?.length) return 0;
      const del = await db.from("body_metrics").delete().eq("id", data[0].id);
      if (del.error) throw new Error(del.error.message);
      await refresh();
      return Math.round(Number(data[0].value));
    },
  };
}
