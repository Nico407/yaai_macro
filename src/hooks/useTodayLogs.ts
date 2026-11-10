import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { localDateISO } from "@/lib/dates";

export type MealLog = {
  id: string;
  recipe_id: string | null;
  recipe_name: string;
  total_grams: number;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  ingredients_json: unknown;
  logged_at: string;
  log_date: string;
  slot: string | null;
  is_fixed: boolean;
  instructions: string | null;
  servings?: number | null;     // e.g. 1.5 servings (recipes with servings / batch cooked)
  portion_g?: number | null;    // grams on the plate (cooked weight when known)
  eaten?: boolean | null;       // ticked off (Hub / Telegram): its amounts don't change any more
};

function todayISO() {
  return localDateISO();
}

export function useTodayLogs() {
  const today = todayISO();
  return useQuery({
    queryKey: ["meal_logs", "today", today],      // a new day: a new query, so its planned meals move over
    queryFn: async () => {
      // the meals planned for today in the week planner go onto today's plan (once; the database keeps both in step)
      const sync = await (supabase as unknown as {
        rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
      }).rpc("sync_meal_day", { p_date: today });
      if (sync.error) console.warn("sync_meal_day:", sync.error.message);
      const { data, error } = await supabase
        .from("meal_logs")
        .select("*")
        .eq("log_date", today)
        .order("logged_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as MealLog[];
    },
  });
}
