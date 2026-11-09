import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import ProtectedRoute from "@/components/ProtectedRoute";
import Index from "./pages/Index.tsx";
import Onboarding from "./pages/Onboarding.tsx";
import Ingredients from "./pages/Ingredients.tsx";
import Recipes from "./pages/Recipes.tsx";
import PlanMeals from "./pages/PlanMeals.tsx";
import RecipeNew from "./pages/RecipeNew.tsx";
import RecipeScale from "./pages/RecipeScale.tsx";
import QuickLog from "./pages/QuickLog.tsx";
import History from "./pages/History.tsx";
import Planner from "./pages/Planner.tsx";
import Groceries from "./pages/Groceries.tsx";
import Auth from "./pages/Auth.tsx";
import Settings from "./pages/Settings.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const CountryRedirect = () => {
  const { country = "" } = useParams();
  return <Navigate to={`/plan?country=${encodeURIComponent(country)}`} replace />;
};

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
          <Route path="/plan" element={<P><PlanMeals /></P>} />
          {/* the old three-way choice now lives on one page with filters */}
          <Route path="/plan/cookbook" element={<Navigate to="/plan" replace />} />
          <Route path="/plan/countries" element={<Navigate to="/plan" replace />} />
          <Route path="/plan/countries/:country" element={<CountryRedirect />} />
          <Route path="/plan/mine" element={<Navigate to="/recipes" replace />} />
          <Route path="/quick-log" element={<P><QuickLog /></P>} />
          <Route path="/planner" element={<P><Planner /></P>} />
          <Route path="/groceries" element={<P><Groceries /></P>} />
          <Route path="/history" element={<P><History /></P>} />
          <Route path="/settings" element={<P><Settings /></P>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
