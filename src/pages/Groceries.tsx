import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, endOfWeek, format, parseISO, startOfWeek } from "date-fns";
import { ArrowLeft, Check, Loader2, Plus, RefreshCw, ShoppingCart, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { amountLabel, groupItems, STAPLES, type GroceryItem } from "@/lib/groceries";
import { cn } from "@/lib/utils";

// The grocery list for the planned meals. Built in the database (build_grocery_list), so YAAI's /groceries on
// Telegram shows the same items and ticks; refreshed every few seconds so a tick on the phone shows up here.

type Range = "rest" | "next";

function rangeOf(r: Range) {
  const today = new Date();
  if (r === "next") {
    const mon = addDays(startOfWeek(today, { weekStartsOn: 1 }), 7);
    return { from: mon, to: endOfWeek(mon, { weekStartsOn: 1 }) };
  }
  return { from: today, to: endOfWeek(today, { weekStartsOn: 1 }) };
}

const db = supabase as unknown as {
  from: (t: string) => any;
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

export default function Groceries() {
  const qc = useQueryClient();
  const [range, setRange] = useState<Range>(() => (new Date().getDay() >= 5 || new Date().getDay() === 0 ? "next" : "rest"));
  const [busy, setBusy] = useState(false);
  const [newItem, setNewItem] = useState("");

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["grocery_items"],
    refetchInterval: 5000,
    queryFn: async () => {
      const { data, error } = await db.from("grocery_items").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as GroceryItem[];
    },
  });
  const groups = useMemo(() => groupItems(items), [items]);
  const built = items.find((i) => !i.by_hand && i.from_date);
  const open = items.filter((i) => !i.checked && !i.staple).length;

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ["grocery_items"] });
    } catch (e) {
      toast.error("Couldn't update the list", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const build = () =>
    run(async () => {
      const { from, to } = rangeOf(range);
      const { data, error } = await db.rpc("build_grocery_list", {
        p_from: format(from, "yyyy-MM-dd"),
        p_to: format(to, "yyyy-MM-dd"),
      });
      if (error) throw new Error(error.message);
      const n = (data as GroceryItem[]).filter((i) => !i.by_hand).length;
      toast.success(n ? `${n} items from the planner` : "Nothing planned in those days");
    });

  async function toggle(it: GroceryItem) {
    // instant on screen, then saved
    qc.setQueryData<GroceryItem[]>(["grocery_items"], (old) => old?.map((x) => (x.id === it.id ? { ...x, checked: !x.checked } : x)));
    const { error } = await db.from("grocery_items").update({ checked: !it.checked }).eq("id", it.id);
    if (error) toast.error("Couldn't save the tick", { description: error.message });
    qc.invalidateQueries({ queryKey: ["grocery_items"] });
  }

  const add = () =>
    run(async () => {
      const name = newItem.trim();
      if (!name) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sign in required");
      const { error } = await db.from("grocery_items").upsert(
        { user_id: user.id, key: name.toLowerCase(), name: name[0].toUpperCase() + name.slice(1), aisle: "Other", by_hand: true, checked: false },
        { onConflict: "user_id,key" },
      );
      if (error) throw new Error(error.message);
      setNewItem("");
    });

  const clearTicked = () =>
    run(async () => {
      const ids = items.filter((i) => i.checked).map((i) => i.id);
      if (!ids.length) return;
      const { error } = await db.from("grocery_items").delete().in("id", ids);
      if (error) throw new Error(error.message);
    });

  const remove = (it: GroceryItem) =>
    run(async () => {
      const { error } = await db.from("grocery_items").delete().eq("id", it.id);
      if (error) throw new Error(error.message);
    });

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 py-5 md:py-10">
        <header className="mb-4">
          <Link to="/planner" className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Planner
          </Link>
          <h1 className="flex items-center gap-2 font-display text-2xl font-bold md:text-4xl">
            <ShoppingCart className="h-6 w-6 text-primary" /> Groceries
          </h1>
          <p className="text-xs text-muted-foreground md:text-sm">
            {built?.from_date && built.to_date
              ? `For the meals planned ${format(parseISO(built.from_date), "EEE dd MMM")} – ${format(parseISO(built.to_date), "EEE dd MMM")}. ${open} left to get.`
              : "Everything the planned meals need, by aisle. Also on Telegram: /groceries."}
          </p>
        </header>

        <Card className="mb-4 flex flex-wrap items-center gap-2 p-3">
          <div className="flex rounded-lg bg-secondary p-0.5 text-xs">
            {(["rest", "next"] as Range[]).map((r) => (
              <button key={r} type="button" onClick={() => setRange(r)}
                className={cn("rounded-md px-3 py-1.5 transition-colors", range === r ? "bg-background text-foreground shadow-sm" : "text-muted-foreground")}>
                {r === "rest" ? "Rest of this week" : "Next week"}
              </button>
            ))}
          </div>
          <Button size="sm" onClick={build} disabled={busy} className="ml-auto">
            {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}
            {built ? "Rebuild from planner" : "Make list from planner"}
          </Button>
        </Card>

        {isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : items.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            No list yet. Plan your meals (or ask YAAI: "plan my meals for the week"), then make the list here.
          </Card>
        ) : (
          <div className="space-y-3">
            {groups.map(([section, list]) => (
              <Card key={section} className={cn("p-3", section === STAPLES && "border-dashed")}>
                <p className="mb-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                  {section}
                </p>
                <ul className="divide-y divide-border/60">
                  {list.map((it) => (
                    <li key={it.id} className="flex items-center gap-3 py-1.5">
                      <button type="button" onClick={() => toggle(it)} aria-label={`${it.checked ? "Untick" : "Tick"} ${it.name}`}
                        className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors",
                          it.checked ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40")}>
                        {it.checked && <Check className="h-3.5 w-3.5" />}
                      </button>
                      <button type="button" onClick={() => toggle(it)} className="min-w-0 flex-1 text-left">
                        <span className={cn("text-sm", it.checked && "text-muted-foreground line-through")}>{it.name}</span>
                        {amountLabel(it.grams, it.name) && (
                          <span className="ml-2 text-xs text-muted-foreground">{amountLabel(it.grams, it.name)}</span>
                        )}
                        {(it.recipes ?? []).length > 0 && (
                          <span className="block truncate text-[11px] text-muted-foreground/70">{(it.recipes ?? []).join(" · ")}</span>
                        )}
                      </button>
                      {it.by_hand && (
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => remove(it)} aria-label={`Remove ${it.name}`}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        )}

        <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); add(); }}>
          <Input value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="Add something else (toilet paper, coffee…)" />
          <Button type="submit" variant="secondary" disabled={busy || !newItem.trim()}><Plus className="h-4 w-4" /></Button>
        </form>
        {items.some((i) => i.checked) && (
          <Button variant="ghost" size="sm" className="mt-2 w-full text-muted-foreground" onClick={clearTicked} disabled={busy}>
            Remove ticked items
          </Button>
        )}
      </div>
    </div>
  );
}
