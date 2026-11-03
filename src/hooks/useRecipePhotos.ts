import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Photos of your own recipes: recipe id -> JPEG data URL. */
export function useRecipePhotos() {
  return useQuery({
    queryKey: ["recipe_photos"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("recipe_photos").select("recipe_id, image");
      if (error) throw error;
      return new Map((data ?? []).map((p) => [p.recipe_id, p.image]));
    },
  });
}

/** Save (image) or remove (null) a recipe's photo. */
export function useSaveRecipePhoto() {
  const qc = useQueryClient();
  return async (recipeId: string, image: string | null) => {
    if (image === null) {
      const { error } = await supabase.from("recipe_photos").delete().eq("recipe_id", recipeId);
      if (error) throw error;
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sign in required");
      const { error } = await supabase.from("recipe_photos")
        .upsert({ recipe_id: recipeId, user_id: user.id, image, updated_at: new Date().toISOString() });
      if (error) throw error;
    }
    await qc.invalidateQueries({ queryKey: ["recipe_photos"] });
  };
}
