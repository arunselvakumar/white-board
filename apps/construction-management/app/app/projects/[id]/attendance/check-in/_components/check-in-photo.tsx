"use client";

import { ImageOff } from "lucide-react";
import { useState } from "react";
import { cn } from "@repo/ui/lib/utils";

/**
 * An entry's photo, or a quiet placeholder when it was removed (90 days,
 * ADR CM-0043 §6) or does not load.
 */
export function CheckInPhoto({
  src,
  className,
  removedLabel = "Photo removed",
  showLabel = false,
}: {
  /** Null when the entry has no photo any more. */
  src: string | null;
  /** Size and shape; the image fills it. */
  className?: string;
  /** Read by screen readers in place of the photo. */
  removedLabel?: string;
  /** Write `removedLabel` under the icon, for a box large enough. */
  showLabel?: boolean;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  if (src == null || failed === src) {
    const label = src == null ? removedLabel : "Photo not available";
    return (
      <span
        role="img"
        aria-label={label}
        className={cn(
          "bg-muted text-muted-foreground flex shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg p-1 text-center",
          className,
        )}
      >
        <ImageOff aria-hidden="true" className="size-1/3 max-h-6 max-w-6" />
        {showLabel ? (
          <span aria-hidden="true" className="text-[11px] leading-tight">
            {label}
          </span>
        ) : null}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a private, signed-in route
    <img
      src={src}
      alt=""
      className={cn("bg-muted shrink-0 rounded-lg object-cover", className)}
      onError={() => {
        setFailed(src);
      }}
    />
  );
}
