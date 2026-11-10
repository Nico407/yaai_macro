import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { Scale } from "lucide-react";
import { Card } from "@/components/ui/card";
import { rollingAverage, useBodyRows, weightsByDay } from "@/hooks/useBody";
import { cn } from "@/lib/utils";

const RANGES = [30, 90, 365] as const;

/** History: morning weigh-ins as dots, the 7-day average as the line (single weigh-ins jump around; the line is
 *  what's really happening). Water per day as thin bars along the bottom. */
export function WeightCard() {
  const [range, setRange] = useState<(typeof RANGES)[number]>(90);
  const { data: rows = [] } = useBodyRows(range);
  const points = useMemo(() => rollingAverage(weightsByDay(rows)), [rows]);
  const water = useMemo(() => {
    const out: Record<string, number> = {};
    rows.filter((r) => r.metric === "water").forEach((r) => (out[r.day] = (out[r.day] ?? 0) + Number(r.value)));
    return out;
  }, [rows]);

  const W = 600, H = 180, PAD = 28;
  const start = Date.now() - range * 86400000;
  const x = (day: string) => PAD + ((parseISO(day).getTime() - start) / (range * 86400000)) * (W - PAD * 2);
  const kgs = points.flatMap((p) => [p.kg, p.avg]);
  const lo = Math.floor(Math.min(...kgs) - 0.5), hi = Math.ceil(Math.max(...kgs) + 0.5);
  const y = (kg: number) => PAD / 2 + (1 - (kg - lo) / (hi - lo || 1)) * (H - PAD * 1.5 - 24);
  const maxWater = Math.max(2500, ...Object.values(water));
  const first = points[0], last = points[points.length - 1];

  return (
    <Card className="mt-4 rounded-2xl p-6 shadow-soft md:p-8">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold"><Scale className="h-4 w-4 text-primary" /> Weight & water</h2>
        <div className="flex rounded-lg bg-secondary p-0.5 text-xs">
          {RANGES.map((r) => (
            <button key={r} type="button" onClick={() => setRange(r)}
              className={cn("rounded-md px-2.5 py-1", range === r ? "bg-background shadow-sm" : "text-muted-foreground")}>
              {r === 365 ? "1y" : `${r}d`}
            </button>
          ))}
        </div>
      </div>
      {points.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No weigh-ins yet. Log one on the Today page, in the Hub, or send the number to YAAI on Telegram.
        </p>
      ) : (
        <>
          <p className="mb-2 text-sm text-muted-foreground">
            Now <span className="font-semibold text-foreground tabular-nums">{last.avg} kg</span> (7-day average)
            {first !== last && (
              <> · {last.avg - first.avg >= 0 ? "+" : ""}{(last.avg - first.avg).toFixed(1)} kg since {format(parseISO(first.day), "d MMM")}</>
            )}
          </p>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Weight and water over time">
            {[lo, (lo + hi) / 2, hi].map((v) => (
              <g key={v}>
                <line x1={PAD} x2={W - PAD} y1={y(v)} y2={y(v)} className="stroke-border" strokeDasharray="2 4" />
                <text x={PAD - 4} y={y(v) + 3} textAnchor="end" className="fill-muted-foreground text-[9px]">{v.toFixed(0)}</text>
              </g>
            ))}
            {Object.entries(water).map(([day, ml]) => (
              <rect key={day} x={x(day) - 2} width={4} y={H - 4 - (ml / maxWater) * 20} height={(ml / maxWater) * 20}
                rx={1} className="fill-sky-400/50"><title>{`${day}: ${ml} ml water`}</title></rect>
            ))}
            <polyline points={points.map((p) => `${x(p.day)},${y(p.avg)}`).join(" ")} fill="none"
              className="stroke-primary" strokeWidth={2} strokeLinejoin="round" />
            {points.map((p) => (
              <circle key={p.day} cx={x(p.day)} cy={y(p.kg)} r={2.5} className="fill-foreground/40">
                <title>{`${format(parseISO(p.day), "EEE d MMM")}: ${p.kg} kg (7-day ${p.avg})`}</title>
              </circle>
            ))}
          </svg>
          <p className="mt-1 text-xs text-muted-foreground">Dots: morning weigh-ins · line: 7-day average · blue: water per day</p>
        </>
      )}
    </Card>
  );
}
