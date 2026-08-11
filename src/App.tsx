import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import ProtectedRoute from "@/components/ProtectedRoute";
import Index from "./pages/Index.tsx";
import Onboarding from "./pages/Onboarding.tsx";
import Ingredients from "./pages/Ingredients.tsx";
import Recipes from "./pages/Recipes.tsx";
import RecipesHub from "./pages/RecipesHub.tsx";
import Cookbook from "./pages/Cookbook.tsx";
import Countries from "./pages/Countries.tsx";
import CountryCookbook from "./pages/CountryCookbook.tsx";
import RecipeNew from "./pages/RecipeNew.tsx";
import RecipeScale from "./pages/RecipeScale.tsx";
import QuickLog from "./pages/QuickLog.tsx";
import History from "./pages/History.tsx";
import Planner from "./pages/Planner.tsx";
import Auth from "./pages/Auth.tsx";
import Settings from "./pages/Settings.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const P = ({ children }: { children: React.ReactNode }) => <ProtectedRoute>{children}</ProtectedRoute>;

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/main" replace />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/main" element={<P><Index /></P>} />
          <Route path="/onboarding" element={<P><Onboarding /></P>} />
          <Route path="/ingredients" element={<P><Ingredients /></P>} />
          <Route path="/recipes" element={<P><Recipes /></P>} />
          <Route path="/recipes/new" element={<P><RecipeNew /></P>} />
          <Route path="/recipes/:id/edit" element={<P><RecipeNew /></P>} />
          <Route path="/recipes/:id/scale" element={<P><RecipeScale /></P>} />
          <Route path="/plan" element={<P><RecipesHub /></P>} />
          <Route path="/plan/cookbook" element={<P><Cookbook /></P>} />
          <Route path="/plan/countries" element={<P><Countries /></P>} />
          <Route path="/plan/countries/:country" element={<P><CountryCookbook /></P>} />
          <Route path="/plan/mine" element={<Navigate to="/recipes" replace />} />
          <Route path="/quick-log" element={<P><QuickLog /></P>} />
          <Route path="/planner" element={<P><Planner /></P>} />
          <Route path="/history" element={<P><History /></P>} />
          <Route path="/settings" element={<P><Settings /></P>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
