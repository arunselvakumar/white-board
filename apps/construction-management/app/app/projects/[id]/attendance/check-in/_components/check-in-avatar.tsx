import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@repo/ui/components/avatar";
import { cn } from "@repo/ui/lib/utils";

import { initialsOf } from "./check-in-format";

/**
 * A person's initials, or their record photo when `photoUrl` is given and
 * loads; initials again when it fails.
 */
export function CheckInAvatar({
  name,
  photoUrl = null,
  className,
}: {
  name: string;
  photoUrl?: string | null;
  /** Size; `size-11` by default. */
  className?: string;
}) {
  return (
    <Avatar aria-hidden="true" className={cn("size-11", className)}>
      {photoUrl == null ? null : (
        <AvatarImage src={photoUrl} alt="" className="object-cover" />
      )}
      <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
        {initialsOf(name)}
      </AvatarFallback>
    </Avatar>
  );
}
