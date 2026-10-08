import { HardHat } from "lucide-react";

import { cn } from "@repo/ui/lib/utils";

/** The product mark until a brand exists: a hard hat on the primary colour. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-lg",
        className,
      )}
    >
      <HardHat className="size-4.5" />
    </span>
  );
}
