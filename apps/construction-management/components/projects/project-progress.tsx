import { cn } from "@repo/ui/lib/utils";

import type { ProjectList } from "@/src/queries/projects";

type Progress = ProjectList["items"][number]["progress"];

/** `42.5` → "42.5%"; whole numbers without decimals. */
function percent(value: number): string {
  return `${String(Math.round(value * 100) / 100)}%`;
}

/**
 * Project Progress % on the Project card and the Project home (ADR CM-0013
 * §2, CM-0019 §4, CM-805): a thin bar with the figure beside it, and the
 * weighting for screen readers and on hover. Nothing at all for a Project
 * without tasks: no bar rather than a made-up number.
 */
export function ProjectProgressBar({
  progress,
  className,
}: {
  progress: Progress;
  className?: string;
}) {
  if (progress == null) return null;
  const weighting =
    progress.weighting === "price"
      ? "weighted by Total Price"
      : "weighted by duration";
  return (
    <div
      className={cn("flex min-w-0 items-center gap-2", className)}
      title={`Project Progress ${percent(progress.pct)}, ${weighting}`}
    >
      <div
        role="progressbar"
        aria-label="Project Progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.pct}
        aria-valuetext={`${percent(progress.pct)}, ${weighting}`}
        className="bg-muted h-1.5 w-full max-w-40 min-w-16 overflow-hidden rounded-full"
      >
        <div
          className="bg-primary h-full rounded-full"
          style={{
            width: `${String(Math.max(0, Math.min(100, progress.pct)))}%`,
          }}
        />
      </div>
      <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
        {percent(progress.pct)}
      </span>
    </div>
  );
}
