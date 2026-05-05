interface MacroRingProps {
  consumed: number;
  target: number;
  label: string;
  unit: string;
  colorVar: string; // e.g. "--macro-protein"
}

export function MacroRing({ consumed, target, label, unit, colorVar }: MacroRingProps) {
  const safeTarget = Math.max(target, 1);
  const pct = Math.min(100, Math.max(0, (consumed / safeTarget) * 100));
  const remaining = Math.max(0, target - consumed);
  const r = 42;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
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
            strokeDasharray={`${dash} ${c}`}
            className="transition-all duration-500"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-2xl font-bold leading-none">{Math.round(remaining)}</span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">left</span>
        </div>
      </div>
      <div className="text-center">
        <div className="text-sm font-semibold">{label}</div>
        <div className="text-xs text-muted-foreground">
          {Math.round(consumed)} / {Math.round(target)} {unit}
        </div>
      </div>
    </div>
  );
}
