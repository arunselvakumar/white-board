import type { ComponentProps } from "react";
import { cn } from "@repo/ui/lib/utils";

/**
 * The white surface a table sits on, header included, so its rows
 * never blend into the page behind them.
 */
export function TableCard({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="table-card"
      className={cn("bg-card overflow-hidden rounded-xl border", className)}
      {...props}
    />
  );
}
