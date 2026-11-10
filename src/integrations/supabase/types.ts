export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      cookbook_recipes: {
        Row: {
          serving_g: number | null
          base_tags: string[]
          protein_tags: string[]
          lifestyle: string | null
          carbs_g: number
          cook_time_min: number
          country: string | null
          created_at: string
          cuisine_tags: string[]
          description: string | null
          fat_g: number
          id: string
          image_url: string | null
          ingredients: string[]
          instructions: string[]
          is_favorite: boolean
          kcal: number
          name: string
          protein_g: number
          sort_order: number
        }
        Insert: {
          serving_g?: number | null
          base_tags?: string[]
          protein_tags?: string[]
          lifestyle?: string | null
          carbs_g?: number
          cook_time_min?: number
          country?: string | null
          created_at?: string
          cuisine_tags?: string[]
          description?: string | null
          fat_g?: number
          id?: string
          image_url?: string | null
          ingredients?: string[]
          instructions?: string[]
          is_favorite?: boolean
          kcal: number
          name: string
          protein_g?: number
          sort_order?: number
        }
        Update: {
          serving_g?: number | null
          base_tags?: string[]
          protein_tags?: string[]
          lifestyle?: string | null
          carbs_g?: number
          cook_time_min?: number
          country?: string | null
          created_at?: string
          cuisine_tags?: string[]
          description?: string | null
          fat_g?: number
          id?: string
          image_url?: string | null
          ingredients?: string[]
          instructions?: string[]
          is_favorite?: boolean
          kcal?: number
          name?: string
          protein_g?: number
          sort_order?: number
        }
        Relationships: []
      }
      ingredients: {
        Row: {
          carbs_per_100g: number
          created_at: string
          dietary_tags: string[]
          fat_per_100g: number
          fibre_per_100g: number | null
          salt_per_100g: number | null
          id: string
          kcal_per_100g: number
          name: string
          name_de: string | null
          source: string | null
          source_id: string | null
          protein_per_100g: number
        }
        Insert: {
          carbs_per_100g?: number
          created_at?: string
          dietary_tags?: string[]
          fat_per_100g?: number
          fibre_per_100g?: number | null
          salt_per_100g?: number | null
          id?: string
          kcal_per_100g: number
          name: string
          name_de?: string | null
          source?: string | null
          source_id?: string | null
          protein_per_100g?: number
        }
        Update: {
          carbs_per_100g?: number
          created_at?: string
          dietary_tags?: string[]
          fat_per_100g?: number
          fibre_per_100g?: number | null
          salt_per_100g?: number | null
          id?: string
          kcal_per_100g?: number
          name?: string
          name_de?: string | null
          source?: string | null
          source_id?: string | null
          protein_per_100g?: number
        }
        Relationships: []
      }
      meal_logs: {
        Row: {
          servings: number | null
          portion_g: number | null
          carbs_g: number
          fat_g: number
          id: string
          ingredients_json: Json | null
          instructions: string | null
          is_fixed: boolean
          kcal: number
          log_date: string
          logged_at: string
          protein_g: number
          recipe_id: string | null
          recipe_name: string
          slot: string | null
          total_grams: number
          user_id: string
        }
        Insert: {
          servings?: number | null
          portion_g?: number | null
          carbs_g: number
          fat_g: number
          id?: string
          ingredients_json?: Json | null
          instructions?: string | null
          is_fixed?: boolean
          kcal: number
          log_date?: string
          logged_at?: string
          protein_g: number
          recipe_id?: string | null
          recipe_name: string
          slot?: string | null
          total_grams: number
          user_id: string
        }
        Update: {
          servings?: number | null
          portion_g?: number | null
          carbs_g?: number
          fat_g?: number
          id?: string
          ingredients_json?: Json | null
          instructions?: string | null
          is_fixed?: boolean
          kcal?: number
          log_date?: string
          logged_at?: string
          protein_g?: number
          recipe_id?: string | null
          recipe_name?: string
          slot?: string | null
          total_grams?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_logs_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_photos: {
        Row: { image: string; recipe_id: string; updated_at: string; user_id: string }
        Insert: { image: string; recipe_id: string; updated_at?: string; user_id: string }
        Update: { image?: string; recipe_id?: string; updated_at?: string; user_id?: string }
        Relationships: []
      }
      planned_meals: {
        Row: {
          carbs_g: number
          created_at: string
          fat_g: number
          id: string
          ingredients_json: Json
          instructions: string | null
          is_fixed: boolean
          kcal: number
          plan_date: string
          protein_g: number
          recipe_id: string | null
          recipe_name: string
          slot: string | null
          total_grams: number
          user_id: string
        }
        Insert: {
          carbs_g?: number
          created_at?: string
          fat_g?: number
          id?: string
          ingredients_json?: Json
          instructions?: string | null
          is_fixed?: boolean
          kcal?: number
          plan_date: string
          protein_g?: number
          recipe_id?: string | null
          recipe_name: string
          slot?: string | null
          total_grams?: number
          user_id: string
        }
        Update: {
          carbs_g?: number
          created_at?: string
          fat_g?: number
          id?: string
          ingredients_json?: Json
          instructions?: string | null
          is_fixed?: boolean
          kcal?: number
          plan_date?: string
          protein_g?: number
          recipe_id?: string | null
          recipe_name?: string
          slot?: string | null
          total_grams?: number
          user_id?: string
        }
        Relationships: []
      }
      profile: {
        Row: {
          activity_level: string | null
          age: number | null
          created_at: string
          dietary_restrictions: string[]
          display_name: string | null
          goal: string | null
          height_cm: number | null
          id: string
          nutrition_preference: string | null
          sex: string | null
          target_calories: number | null
          target_carbs_g: number | null
          target_fat_g: number | null
          target_protein_g: number | null
          updated_at: string
          user_id: string
          water_goal_ml: number
          weight_kg: number | null
        }
        Insert: {
          activity_level?: string | null
          age?: number | null
          created_at?: string
          dietary_restrictions?: string[]
          display_name?: string | null
          goal?: string | null
          height_cm?: number | null
          id?: string
          nutrition_preference?: string | null
          sex?: string | null
          target_calories?: number | null
          target_carbs_g?: number | null
          target_fat_g?: number | null
          target_protein_g?: number | null
          updated_at?: string
          user_id: string
          water_goal_ml?: number
          weight_kg?: number | null
        }
        Update: {
          activity_level?: string | null
          age?: number | null
          created_at?: string
          dietary_restrictions?: string[]
          display_name?: string | null
          goal?: string | null
          height_cm?: number | null
          id?: string
          nutrition_preference?: string | null
          sex?: string | null
          target_calories?: number | null
          target_carbs_g?: number | null
          target_fat_g?: number | null
          target_protein_g?: number | null
          updated_at?: string
          user_id?: string
          water_goal_ml?: number
          weight_kg?: number | null
        }
        Relationships: []
      }
      recipe_ingredients: {
        Row: {
          id: string
          ingredient_id: string
          ratio: number
          recipe_id: string
        }
        Insert: {
          id?: string
          ingredient_id: string
          ratio: number
          recipe_id: string
        }
        Update: {
          id?: string
          ingredient_id?: string
          ratio?: number
          recipe_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_ingredients_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_ingredients_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          servings: number
          batch_cooked: boolean
          cooked_weight_g: number | null
          extra_ingredients: string[]
          base_tags: string[]
          protein_tags: string[]
          lifestyle: string | null
          country: string | null
          created_at: string
          cuisine_tags: string[]
          default_serving_g: number
          description: string | null
          id: string
          instructions: string | null
          is_favorite: boolean
          is_fixed: boolean
          max_total_g: number
          min_total_g: number
          name: string
          user_id: string
        }
        Insert: {
          servings?: number
          batch_cooked?: boolean
          cooked_weight_g?: number | null
          extra_ingredients?: string[]
          base_tags?: string[]
          protein_tags?: string[]
          lifestyle?: string | null
          country?: string | null
          created_at?: string
          cuisine_tags?: string[]
          default_serving_g?: number
          description?: string | null
          id?: string
          instructions?: string | null
          is_favorite?: boolean
          is_fixed?: boolean
          max_total_g?: number
          min_total_g?: number
          name: string
          user_id: string
        }
        Update: {
          servings?: number
          batch_cooked?: boolean
          cooked_weight_g?: number | null
          extra_ingredients?: string[]
          base_tags?: string[]
          protein_tags?: string[]
          lifestyle?: string | null
          country?: string | null
          created_at?: string
          cuisine_tags?: string[]
          default_serving_g?: number
          description?: string | null
          id?: string
          instructions?: string | null
          is_favorite?: boolean
          is_fixed?: boolean
          max_total_g?: number
          min_total_g?: number
          name?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
