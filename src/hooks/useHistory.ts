import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { MealLog } from "./useTodayLogs";

export type HistoryConfig =
  | { type: "days"; value: number }
  | { type: "year"; value: number }
  | { type: "all" }
  | { type: "range"; start: string; end: string };

export function useHistory(config: HistoryConfig | number = 7) {
  const resolved: HistoryConfig =
    typeof config === "number" ? { type: "days", value: config } : config;

  return useQuery({
    queryKey: ["meal_logs", "history", resolved],
    queryFn: async () => {
      let q = supabase.from("meal_logs").select("*");

      if (resolved.type === "days") {
        const since = new Date();
        since.setDate(since.getDate() - (resolved.value - 1));
        const sinceISO = since.toISOString().slice(0, 10);
        q = q.gte("log_date", sinceISO);
      } else if (resolved.type === "year") {
        q = q
          .gte("log_date", `${resolved.value}-01-01`)
          .lte("log_date", `${resolved.value}-12-31`);
      } else if (resolved.type === "range") {
        q = q
          .gte("log_date", resolved.start)
          .lte("log_date", resolved.end);
      }
      // type "all" has no date filter

      const { data, error } = await q.order("logged_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as MealLog[];
    },
  });
}

export type DaySummary = {
  date: string; // YYYY-MM-DD
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  meals: number;
  ingredients: number;
};

export function summarizeByDay(logs: MealLog[], days: number): DaySummary[] {
  const map = new Map<string, DaySummary>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    map.set(key, { date: key, kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, meals: 0, ingredients: 0 });
  }
  logs.forEach((l) => {
    const s = map.get(l.log_date);
    if (!s) return;
    s.kcal += Number(l.kcal);
    s.protein_g += Number(l.protein_g);
    s.carbs_g += Number(l.carbs_g);
    s.fat_g += Number(l.fat_g);
    s.meals += 1;
    s.ingredients += Array.isArray(l.ingredients_json) ? l.ingredients_json.length : 0;
  });
  return Array.from(map.values());
}

export function summarizeByRange(logs: MealLog[], start: string, end: string): DaySummary[] {
  const map = new Map<string, DaySummary>();
  const startDate = new Date(start + "T00:00:00");
  const endDate = new Date(end + "T00:00:00");
  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    map.set(key, { date: key, kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, meals: 0, ingredients: 0 });
  }
  logs.forEach((l) => {
    const s = map.get(l.log_date);
    if (!s) return;
    s.kcal += Number(l.kcal);
    s.protein_g += Number(l.protein_g);
    s.carbs_g += Number(l.carbs_g);
    s.fat_g += Number(l.fat_g);
    s.meals += 1;
    s.ingredients += Array.isArray(l.ingredients_json) ? l.ingredients_json.length : 0;
  });
  return Array.from(map.values());
}

