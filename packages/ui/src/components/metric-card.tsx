import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cn } from "cn";
import { ArrowUpRight, type LucideIcon } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

type MetricCardProps = Omit<useRender.ComponentProps<"div">, "children"> & {
  /** What is counted, e.g. "Active Students". */
  label: string;
  icon?: LucideIcon;
  /** The figure, in the foreground colour. */
  value: ReactNode;
  /** A unit or currency beside the figure, in a quieter grey: "%", "₹", "/ 30". */
  unit?: string;
  unitPlacement?: "start" | "end";
  /** A short pill after the figure, e.g. "Due". */
  badge?: string;
  badgeTone?: "default" | "warning";
  /** One or two lines under the figure. */
  caption?: ReactNode;
  /** Keeps the card in its primary state, e.g. the chosen filter. */
  active?: boolean;
};

/** Characters the figure and its unit take, so long amounts shrink to fit. */
function figureLength(value: ReactNode, unit: string | undefined): number {
  const text =
    typeof value === "string" || typeof value === "number"
      ? String(value)
      : "0000";
  return Math.max(3, text.length + (unit?.length ?? 0));
}

/**
 * A dashboard figure: icon and label at the top, the value large with its
 * unit in grey, and a caption underneath. Given `render` (a link) or
 * `onClick` it shows an arrow and turns the primary colour on hover and
 * focus; without either it is a plain card.
 */
function MetricCard({
  label,
  icon: Icon,
  value,
  unit,
  unitPlacement = "end",
  badge,
  badgeTone = "default",
  caption,
  active = false,
  className,
  render,
  style,
  ...props
}: MetricCardProps) {
  const interactive = render != null || props.onClick != null;
  const unitText =
    unit == null ? null : (
      <span className="text-muted-foreground metric-lit:text-primary-foreground/60 font-light">
        {unit}
      </span>
    );
  const children = (
    <>
      <span
        aria-hidden="true"
        className="metric-lit:opacity-100 pointer-events-none absolute inset-0 -z-10 bg-linear-to-br from-white/20 via-white/0 to-black/10 opacity-0 transition-opacity duration-200 motion-reduce:transition-none"
      />
      <span className="flex items-start justify-between gap-3">
        <span className="flex min-w-0 flex-col gap-2.5">
          {Icon == null ? null : (
            <Icon
              aria-hidden="true"
              strokeWidth={1.5}
              className="text-muted-foreground metric-lit:text-primary-foreground/85 size-5 shrink-0"
            />
          )}
          <span className="text-sm leading-snug sm:text-base">{label}</span>
        </span>
        {interactive ? (
          <span
            aria-hidden="true"
            className="bg-background text-foreground metric-lit:bg-white/15 metric-lit:text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-xl transition-colors duration-200 motion-reduce:transition-none sm:size-9"
          >
            <ArrowUpRight className="size-4" />
          </span>
        ) : null}
      </span>
      <span className="mt-auto flex flex-wrap items-center gap-x-2.5 gap-y-1 pt-4 sm:pt-6">
        <span className="text-[length:clamp(1.375rem,calc((100cqi_-_3rem)/(var(--metric-chars)*0.56)),3.25rem)] leading-none font-normal tracking-tight break-words tabular-nums">
          {unitPlacement === "start" ? unitText : null}
          {value}
          {unitPlacement === "end" ? unitText : null}
        </span>
        {badge == null ? null : (
          <span
            className={cn(
              "metric-lit:bg-primary-foreground rounded-full px-2 py-0.5 text-xs font-semibold",
              badgeTone === "warning"
                ? "metric-lit:text-amber-700 bg-amber-500/15 text-amber-700 dark:text-amber-300"
                : "bg-primary/10 text-primary metric-lit:text-primary",
            )}
          >
            {badge}
          </span>
        )}
      </span>
      {caption == null ? null : (
        <span className="text-muted-foreground metric-lit:text-primary-foreground/80 mt-3 line-clamp-2 text-sm leading-snug">
          {caption}
        </span>
      )}
    </>
  );
  return useRender({
    defaultTagName: props.onClick == null ? "div" : "button",
    props: mergeProps<"div">(
      {
        className: cn(
          "bg-card text-card-foreground ring-foreground/[0.06] metric-lit:bg-primary metric-lit:text-primary-foreground metric-lit:ring-transparent focus-visible:ring-ring/50 relative isolate @container flex min-h-40 sm:min-h-48 min-w-0 flex-col overflow-hidden rounded-2xl p-4 text-left ring-1 outline-none transition-colors duration-200 focus-visible:ring-3 motion-reduce:transition-none sm:p-5",
          interactive && "cursor-pointer",
          className,
        ),
        style: {
          "--metric-chars": figureLength(value, unit),
          ...style,
        } as CSSProperties,
        children,
        ...(props.onClick != null && render == null
          ? { type: "button" as const }
          : {}),
      },
      props,
    ),
    render,
    state: {
      slot: "metric-card",
      interactive,
      active,
    },
  });
}

export { MetricCard };
