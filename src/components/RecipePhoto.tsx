import { useRef, useState } from "react";
import { Camera, ChefHat, Loader2, Trash2 } from "lucide-react";
import { photoToJpeg } from "@/lib/photo";
import { cn } from "@/lib/utils";

/** A recipe's photo, or the chef hat while there is none. With onPick it's also the button to take / choose one
 *  (on a phone the file picker offers the camera). */
export function RecipePhoto({ src, alt, className, onPick, onRemove, iconClassName }: {
  src?: string | null; alt: string; className?: string; iconClassName?: string;
  onPick?: (image: string) => Promise<void> | void; onRemove?: () => Promise<void> | void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function choose(file: File | undefined) {
    if (!file || !onPick) return;
    setBusy(true);
    setErr(null);
    try {
      await onPick(await photoToJpeg(file));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't save the photo");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  const face = src
    ? <img src={src} alt={alt} className="h-full w-full object-cover" loading="lazy" />
    : <ChefHat className={cn("h-5 w-5 text-primary", iconClassName)} />;

  if (!onPick) {
    return <div className={cn("flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-secondary/60", className)}>{face}</div>;
  }
  return (
    <div className={cn("relative shrink-0", className)}>
      <button type="button" onClick={(e) => { e.stopPropagation(); input.current?.click(); }} disabled={busy}
        title={src ? "Change photo" : "Add photo"} aria-label={src ? "Change photo" : "Add photo"}
        className="group flex h-full w-full items-center justify-center overflow-hidden rounded-xl border border-dashed border-border bg-secondary/60 transition-colors hover:border-primary/60">
        {busy ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : face}
        {!busy && (
          <span className={cn("absolute bottom-1 right-1 rounded-full bg-background/85 p-1 text-primary shadow-sm",
            src && "opacity-0 transition-opacity group-hover:opacity-100")}>
            <Camera className="h-3 w-3" />
          </span>
        )}
      </button>
      {src && onRemove && !busy && (
        <button type="button" onClick={async (e) => { e.stopPropagation(); setBusy(true); try { await onRemove(); } finally { setBusy(false); } }}
          title="Remove photo" aria-label="Remove photo"
          className="absolute left-1 top-1 rounded-full bg-background/85 p-1 text-muted-foreground shadow-sm hover:text-destructive">
          <Trash2 className="h-3 w-3" />
        </button>
      )}
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => choose(e.target.files?.[0])} />
      {err && <p className="absolute left-0 top-full mt-1 w-48 text-[10px] text-destructive">{err}</p>}
    </div>
  );
}
