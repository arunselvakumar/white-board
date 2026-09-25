import { UserRound } from "lucide-react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@repo/ui/components/avatar";

import {
  studentAvatarColor,
  studentInitials,
} from "@/lib/student-avatar-style";

/** The shared avatar for a Student in lists, profiles, and forms. */
export function StudentAvatar({
  studentId,
  name,
  photoUrl,
  className,
  imageAlt = "",
}: {
  studentId?: string;
  name: string;
  photoUrl?: string | null;
  className?: string;
  imageAlt?: string;
}) {
  const initials = studentInitials(name);

  return (
    <Avatar className={className}>
      {photoUrl ? <AvatarImage src={photoUrl} alt={imageAlt} /> : null}
      <AvatarFallback
        className={`font-semibold ${studentAvatarColor(studentId, name)}`}
      >
        {initials || <UserRound className="size-1/2" aria-hidden="true" />}
      </AvatarFallback>
    </Avatar>
  );
}
