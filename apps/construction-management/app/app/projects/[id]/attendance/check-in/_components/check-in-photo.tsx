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
}: {
  /** Null when the entry has no photo any more. */
  src: string | null;
  /** Size and shape; the image fills it. */
  className?: string;
  /** Read by screen readers in place of the photo. */
  removedLabel?: string;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  if (src == null || failed === src)
    return (
      <span
        role="img"
        aria-label={removedLabel}
        className={cn(
          "bg-muted text-muted-foreground flex shrink-0 items-center justify-center rounded-lg",
          className,
        )}
      >
        <ImageOff aria-hidden="true" className="size-1/3 max-h-6 max-w-6" />
      </span>
    );
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
