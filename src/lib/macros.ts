// Macro engine: BMR, TDEE, and target macros.

export type Sex = "male" | "female";
export type ActivityLevel =
  | "sedentary"
  | "light"
  | "moderate"
  | "active"
  | "very_active";
export type Goal = "hard_cut" | "cut" | "maintain" | "bulk" | "hard_bulk";

export interface ProfileInput {
  age: number;
  sex: Sex;
  height_cm: number;
  weight_kg: number;
  activity_level: ActivityLevel;
  goal: Goal;
}

export interface MacroTargets {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  bmr: number;
  tdee: number;
}

const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

const GOAL_ADJUSTMENT: Record<Goal, number> = {
  hard_cut: -0.3,
  cut: -0.2,
  maintain: 0,
  bulk: 0.15,
  hard_bulk: 0.25,
};

// Mifflin–St Jeor
export function calcBMR({ sex, weight_kg, height_cm, age }: ProfileInput): number {
  const base = 10 * weight_kg + 6.25 * height_cm - 5 * age;
  return sex === "male" ? base + 5 : base - 161;
}

export function calcTDEE(input: ProfileInput): number {
  return calcBMR(input) * ACTIVITY_FACTORS[input.activity_level];
}

export function calcTargets(input: ProfileInput): MacroTargets {
  const bmr = calcBMR(input);
  const tdee = calcTDEE(input);
  const calories = Math.round(tdee * (1 + GOAL_ADJUSTMENT[input.goal]));

  // Macro split: 2.0g/kg protein, 25% kcal from fat, rest carbs
  const protein_g = Math.round(input.weight_kg * 2.0);
  const fat_g = Math.round((calories * 0.25) / 9);
  const remaining = calories - protein_g * 4 - fat_g * 9;
  const carbs_g = Math.max(0, Math.round(remaining / 4));

  return {
    calories,
    protein_g,
    carbs_g,
    fat_g,
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
  };
}

export interface MacroTotals {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export function sumMacros(rows: MacroTotals[]): MacroTotals {
  return rows.reduce(
    (acc, r) => ({
      kcal: acc.kcal + Number(r.kcal),
      protein_g: acc.protein_g + Number(r.protein_g),
      carbs_g: acc.carbs_g + Number(r.carbs_g),
      fat_g: acc.fat_g + Number(r.fat_g),
    }),
    { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  );
}

export function remaining(target: MacroTotals, consumed: MacroTotals): MacroTotals {
  return {
    kcal: target.kcal - consumed.kcal,
    protein_g: target.protein_g - consumed.protein_g,
    carbs_g: target.carbs_g - consumed.carbs_g,
    fat_g: target.fat_g - consumed.fat_g,
  };
}
