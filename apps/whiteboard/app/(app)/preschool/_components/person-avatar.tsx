import { cn } from "@repo/ui/lib/utils";

const TONES = [
  "bg-violet-100 text-violet-800 dark:bg-violet-400/15 dark:text-violet-200",
  "bg-sky-100 text-sky-800 dark:bg-sky-400/15 dark:text-sky-200",
  "bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-200",
  "bg-teal-100 text-teal-800 dark:bg-teal-400/15 dark:text-teal-200",
  "bg-pink-100 text-pink-800 dark:bg-pink-400/15 dark:text-pink-200",
] as const;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "?";
  const last = parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "";
  return `${first}${last}`.toUpperCase();
}

function toneFor(seed: string): string {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return TONES[hash % TONES.length] ?? TONES[0];
}

/**
 * A Child's (or an Authorised Pickup's) photo, or their initials on a
 * colour picked from their id. Stands in for the shared Child avatar.
 */
export function ChildInitialsAvatar({
  id,
  name,
  photoUrl,
  className,
}: {
  id: string;
  name: string;
  photoUrl?: string | null;
  className?: string;
}) {
  if (photoUrl != null && photoUrl !== "")
    return (
      // eslint-disable-next-line @next/next/no-img-element -- Photos are links on other hosts; next/image needs each host configured.
      <img
        src={photoUrl}
        alt=""
        className={cn("size-10 shrink-0 rounded-full object-cover", className)}
      />
    );
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
        toneFor(id),
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
