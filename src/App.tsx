import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import Onboarding from "./pages/Onboarding.tsx";
import Ingredients from "./pages/Ingredients.tsx";
import Recipes from "./pages/Recipes.tsx";
import RecipesHub from "./pages/RecipesHub.tsx";
import Cookbook from "./pages/Cookbook.tsx";
import Countries from "./pages/Countries.tsx";
import RecipeNew from "./pages/RecipeNew.tsx";
import RecipeScale from "./pages/RecipeScale.tsx";
import QuickLog from "./pages/QuickLog.tsx";
import History from "./pages/History.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/ingredients" element={<Ingredients />} />
          <Route path="/recipes" element={<RecipesHub />} />
          <Route path="/recipes/cookbook" element={<Cookbook />} />
          <Route path="/recipes/countries" element={<Countries />} />
          <Route path="/recipes/mine" element={<Recipes />} />
          <Route path="/recipes/new" element={<RecipeNew />} />
          <Route path="/recipes/:id/edit" element={<RecipeNew />} />
          <Route path="/recipes/:id/scale" element={<RecipeScale />} />
          <Route path="/quick-log" element={<QuickLog />} />
          <Route path="/history" element={<History />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
