import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { MealLog } from "./useTodayLogs";

export type DateRange = {
  start: string; // YYYY-MM-DD
  end: string;   // YYYY-MM-DD
};

export function useHistory(range: DateRange) {
  return useQuery({
    queryKey: ["meal_logs", "history", range.start, range.end],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meal_logs")
        .select("*")
        .gte("log_date", range.start)
        .lte("log_date", range.end)
        .order("logged_at", { ascending: false });
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

function dateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const cur = new Date(start + "T00:00:00");
  const last = new Date(end + "T00:00:00");
  while (cur <= last) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

export function summarizeByDay(logs: MealLog[], range: DateRange): DaySummary[] {
  const map = new Map<string, DaySummary>();
  dateRange(range.start, range.end).forEach((key) => {
    map.set(key, { date: key, kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, meals: 0, ingredients: 0 });
  });
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
