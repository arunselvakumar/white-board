import { UserRound } from "lucide-react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@repo/ui/components/avatar";

export function TeacherAvatar({
  name,
  photoUrl,
  className = "size-12",
}: {
  name: string;
  photoUrl?: string | null;
  className?: string;
}) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <Avatar className={className}>
      {photoUrl ? <AvatarImage src={photoUrl} alt={`${name} photo`} /> : null}
      <AvatarFallback className="bg-primary/10 text-primary font-semibold">
        {initials || <UserRound className="size-1/2" aria-hidden="true" />}
      </AvatarFallback>
    </Avatar>
  );
}
