import { UserRound } from "lucide-react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@repo/ui/components/avatar";

// The same colour rule as the Training Institute's Student avatar
// (docs/ui/student-avatar.md): the colour follows the Child's id, so renaming
// a Child never changes it. Attendance, Daily Report and Child screens all
// draw Children with this component; screens never pick avatar colours.

const AVATAR_COLOURS = [
  "bg-violet-100 text-violet-700 dark:bg-violet-400/20 dark:text-violet-200",
  "bg-sky-100 text-sky-700 dark:bg-sky-400/20 dark:text-sky-200",
  "bg-rose-100 text-rose-700 dark:bg-rose-400/20 dark:text-rose-200",
  "bg-amber-100 text-amber-800 dark:bg-amber-400/20 dark:text-amber-200",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/20 dark:text-emerald-200",
  "bg-teal-100 text-teal-800 dark:bg-teal-400/20 dark:text-teal-200",
  "bg-indigo-100 text-indigo-700 dark:bg-indigo-400/20 dark:text-indigo-200",
] as const;

export function childAvatarColour(
  id: string | undefined,
  name: string,
): string {
  const key = id ?? name.trim().toLowerCase();
  if (key.length === 0) return "bg-muted text-muted-foreground";
  let hash = 0;
  for (const character of key)
    hash = (hash * 31 + (character.codePointAt(0) ?? 0)) >>> 0;
  return AVATAR_COLOURS[hash % AVATAR_COLOURS.length] ?? AVATAR_COLOURS[0];
}

export function childInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/** A Child's photo, or their initials on their colour. Also used for Authorised Pickups. */
export function ChildAvatar({
  childId,
  name,
  photoUrl,
  className,
  imageAlt = "",
}: {
  childId?: string;
  name: string;
  photoUrl?: string | null;
  className?: string;
  imageAlt?: string;
}) {
  const initials = childInitials(name);
  return (
    <Avatar className={className}>
      {photoUrl ? <AvatarImage src={photoUrl} alt={imageAlt} /> : null}
      <AvatarFallback
        className={`font-semibold ${childAvatarColour(childId, name)}`}
      >
        {initials || <UserRound className="size-1/2" aria-hidden="true" />}
      </AvatarFallback>
    </Avatar>
  );
}
