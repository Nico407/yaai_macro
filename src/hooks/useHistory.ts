import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { MealLog } from "./useTodayLogs";

export function useHistory(days = 7) {
  return useQuery({
    queryKey: ["meal_logs", "history", days],
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - (days - 1));
      const sinceISO = since.toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("meal_logs")
        .select("*")
        .gte("log_date", sinceISO)
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
};

export function summarizeByDay(logs: MealLog[], days: number): DaySummary[] {
  const map = new Map<string, DaySummary>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    map.set(key, { date: key, kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, meals: 0 });
  }
  logs.forEach((l) => {
    const s = map.get(l.log_date);
    if (!s) return;
    s.kcal += Number(l.kcal);
    s.protein_g += Number(l.protein_g);
    s.carbs_g += Number(l.carbs_g);
    s.fat_g += Number(l.fat_g);
    s.meals += 1;
  });
  return Array.from(map.values());
}
