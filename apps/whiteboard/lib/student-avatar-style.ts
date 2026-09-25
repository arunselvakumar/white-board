const avatarColors = [
  "bg-violet-100 text-violet-700 dark:bg-violet-400/20 dark:text-violet-200",
  "bg-sky-100 text-sky-700 dark:bg-sky-400/20 dark:text-sky-200",
  "bg-rose-100 text-rose-700 dark:bg-rose-400/20 dark:text-rose-200",
  "bg-amber-100 text-amber-800 dark:bg-amber-400/20 dark:text-amber-200",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/20 dark:text-emerald-200",
  "bg-teal-100 text-teal-800 dark:bg-teal-400/20 dark:text-teal-200",
  "bg-indigo-100 text-indigo-700 dark:bg-indigo-400/20 dark:text-indigo-200",
] as const;

/** Use the persisted Student ID so renaming a Student never changes their color. */
export function studentAvatarColor(
  id: string | undefined,
  name: string,
): string {
  const key = id ?? name.trim().toLowerCase();
  if (key.length === 0) {
    return "bg-muted text-muted-foreground";
  }

  let hash = 0;
  for (const character of key) {
    hash = (hash * 31 + (character.codePointAt(0) ?? 0)) >>> 0;
  }
  return avatarColors[hash % avatarColors.length] ?? avatarColors[0];
}

export function studentInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
