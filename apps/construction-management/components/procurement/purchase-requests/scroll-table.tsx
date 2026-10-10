import type { ReactNode } from "react";
import { cn } from "@repo/ui/lib/utils";

/**
 * A table that scrolls sideways inside its own bordered box on narrow
 * screens. The box is a focusable, named region so keyboard users can
 * scroll it (axe `scrollable-region-focusable`); use it for read-only
 * tables, whose cells hold nothing focusable. Children are the
 * `TableHeader` / `TableBody` parts.
 */
export function ScrollTable({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className={cn(
        "focus-visible:ring-ring/50 overflow-x-auto rounded-lg border outline-none focus-visible:ring-3",
        className,
      )}
    >
      <table aria-label={label} className="w-full caption-bottom text-sm">
        {children}
      </table>
    </div>
  );
}
