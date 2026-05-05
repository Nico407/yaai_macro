interface MacroRingProps {
  consumed: number;
  target: number;
  label: string;
  unit: string;
  colorVar: string; // e.g. "--macro-protein"
}

export function MacroRing({ consumed, target, label, unit, colorVar }: MacroRingProps) {
  const safeTarget = Math.max(target, 1);
  const rawPct = (consumed / safeTarget) * 100;
  const basePct = Math.min(100, Math.max(0, rawPct));
  const overPct = Math.min(100, Math.max(0, rawPct - 100));
  const diff = consumed - target; // positive = overshoot
  const r = 42;
  const c = 2 * Math.PI * r;
  const baseDash = (basePct / 100) * c;
  const overDash = (overPct / 100) * c;
  const isOver = diff > 0;
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative h-28 w-28">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
          <circle cx="50" cy="50" r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="8" />
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke={`hsl(var(${colorVar}))`}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${baseDash} ${c}`}
            className="transition-all duration-500"
          />
          {isOver && (
            <circle
              cx="50"
              cy="50"
              r={r}
              fill="none"
              stroke="hsl(var(--destructive))"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={`${overDash} ${c}`}
              className="transition-all duration-500"
            />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={`font-display text-2xl font-bold leading-none ${isOver ? "text-destructive" : ""}`}
          >
            {isOver ? `+${Math.round(diff)}` : Math.round(diff === 0 ? 0 : -diff)}
          </span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {isOver ? "over" : "left"}
          </span>
        </div>
      </div>
      <div className="text-center">
        <div className="text-sm font-semibold">{label}</div>
        <div className={`text-xs ${isOver ? "text-destructive" : "text-muted-foreground"}`}>
          {Math.round(consumed)} / {Math.round(target)} {unit}
        </div>
      </div>
    </div>
  );
}
