import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@repo/ui/components/avatar";
import { cn } from "@repo/ui/lib/utils";

import { projectInitials } from "./project-status";

/**
 * A Project's logo, or its initials when it has none (CM-401): on the
 * Projects home and in the project shell header.
 */
export function ProjectAvatar({
  name,
  logoUrl,
  className,
}: {
  name: string;
  logoUrl: string | null;
  /** Size; `size-10` by default. */
  className?: string;
}) {
  return (
    <Avatar
      aria-hidden="true"
      className={cn("size-10 rounded-xl after:rounded-xl", className)}
    >
      {logoUrl == null ? null : (
        <AvatarImage
          src={logoUrl}
          alt=""
          className="rounded-xl bg-white object-contain p-0.5"
        />
      )}
      <AvatarFallback className="bg-primary/10 text-primary rounded-xl text-sm font-semibold">
        {projectInitials(name)}
      </AvatarFallback>
    </Avatar>
  );
}
