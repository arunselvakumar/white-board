import { cn } from "@repo/ui/lib/utils";

export type CountStripItem = {
  label: string;
  value: number;
  /** Colour of the figure; neutral when left out. */
  tone?: "green" | "red" | "amber" | "sky" | "muted";
};

const TONE: Record<NonNullable<CountStripItem["tone"]>, string> = {
  green: "text-emerald-700 dark:text-emerald-400",
  red: "text-red-700 dark:text-red-400",
  amber: "text-amber-700 dark:text-amber-400",
  sky: "text-sky-700 dark:text-sky-400",
  muted: "text-muted-foreground",
};

/** A day's figures in one row, wrapping on a phone. */
export function CountStrip({
  label,
  items,
}: {
  /** Names the strip for screen readers ("Attendance counts"). */
  label: string;
  items: readonly CountStripItem[];
}) {
  return (
    <dl
      aria-label={label}
      className="bg-card grid grid-cols-3 gap-px overflow-hidden rounded-xl border sm:flex sm:flex-wrap"
    >
      {items.map((item) => (
        <div key={item.label} className="min-w-0 flex-1 px-3 py-2">
          <dt className="text-muted-foreground truncate text-xs">
            {item.label}
          </dt>
          <dd
            className={cn(
              "text-xl font-semibold tabular-nums",
              item.tone == null ? undefined : TONE[item.tone],
            )}
          >
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
