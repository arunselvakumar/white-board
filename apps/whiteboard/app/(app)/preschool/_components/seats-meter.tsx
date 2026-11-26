import { cn } from "@repo/ui/lib/utils";

/** "Full", "1 seat left", "8 seats left". */
export function seatsLeftLabel(seatsLeft: number): string {
  if (seatsLeft <= 0) return "Full";
  return `${seatsLeft} ${seatsLeft === 1 ? "seat" : "seats"} left`;
}

/** How full a Classroom is: a bar, "12 / 20" and the seats left. */
export function SeatsMeter({
  childCount,
  capacity,
  className,
}: {
  childCount: number;
  capacity: number;
  className?: string;
}) {
  const seatsLeft = Math.max(0, capacity - childCount);
  const percent =
    capacity > 0 ? Math.min(100, Math.round((childCount / capacity) * 100)) : 0;
  return (
    <div className={cn("space-y-1.5", className)}>
      <div
        role="meter"
        aria-label="Seats filled"
        aria-valuemin={0}
        aria-valuemax={capacity}
        aria-valuenow={Math.min(childCount, capacity)}
        aria-valuetext={`${childCount} of ${capacity} seats filled, ${seatsLeftLabel(seatsLeft)}`}
        className="bg-muted h-2 overflow-hidden rounded-full"
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width]",
            seatsLeft === 0 ? "bg-amber-500" : "bg-primary",
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="flex justify-between gap-2 text-xs">
        <span className="text-muted-foreground tabular-nums">
          {childCount} / {capacity}
        </span>
        <span
          className={cn(
            "font-medium",
            seatsLeft === 0 && "text-amber-700 dark:text-amber-400",
          )}
        >
          {seatsLeftLabel(seatsLeft)}
        </span>
      </p>
    </div>
  );
}
