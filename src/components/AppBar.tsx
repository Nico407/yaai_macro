import { Link, NavLink, useNavigate } from "react-router-dom";
import { BookOpen, Calendar, ClipboardList, Home, Settings, Star, UserCog, Carrot } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const ICON = "inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors";
const link = ({ isActive }: { isActive: boolean }) =>
  cn(ICON, isActive ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground");

/** The menu bar on every page: stays at the top while scrolling. */
export function AppBar() {
  const navigate = useNavigate();
  return (
    <div className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-md">
      <nav className="mx-auto flex max-w-3xl items-center justify-between px-4 py-2">
        <Link to="/main" className="font-display text-lg font-bold tracking-tight">
          Macros
        </Link>
        <div className="flex items-center gap-1">
          <NavLink to="/main" end aria-label="Today" title="Today" className={link}><Home className="h-5 w-5" /></NavLink>
          <NavLink to="/plan" aria-label="Recipes" title="Recipes" className={link}><BookOpen className="h-5 w-5" /></NavLink>
          <button type="button" aria-label="Favorites" title="Favorites" onClick={() => navigate("/main?favorites=1")}
            className={cn(ICON, "text-muted-foreground hover:bg-secondary hover:text-foreground")}>
            <Star className="h-5 w-5" />
          </button>
          <NavLink to="/planner" aria-label="Planner" title="Week planner" className={link}><ClipboardList className="h-5 w-5" /></NavLink>
          <NavLink to="/history" aria-label="History" title="History" className={link}><Calendar className="h-5 w-5" /></NavLink>
          <DropdownMenu>
            <DropdownMenuTrigger aria-label="Settings" className={cn(ICON, "text-muted-foreground hover:bg-secondary hover:text-foreground")}>
              <Settings className="h-5 w-5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link to="/ingredients"><Carrot className="mr-2 h-4 w-4" /> Ingredients</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/onboarding"><UserCog className="mr-2 h-4 w-4" /> Edit profile</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/settings"><Settings className="mr-2 h-4 w-4" /> Settings</Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={async () => { await supabase.auth.signOut(); window.location.href = "/auth"; }}>
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </nav>
    </div>
  );
}
