const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const DATE = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});

const FULL = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

/**
 * When a remark was written, as a thread says it: "Just now", "5 min ago",
 * "2 h ago", "Yesterday", then the date ("8 Oct 2026").
 */
export function remarkTime(iso: string, now: Date = new Date()): string {
  const at = new Date(iso);
  const elapsed = now.getTime() - at.getTime();
  if (elapsed < MINUTE) return "Just now";
  if (elapsed < HOUR) return `${String(Math.floor(elapsed / MINUTE))} min ago`;
  if (elapsed < DAY) return `${String(Math.floor(elapsed / HOUR))} h ago`;
  if (elapsed < 2 * DAY) return "Yesterday";
  return DATE.format(at);
}

/** The exact date and time, for a tooltip. */
export function remarkFullTime(iso: string): string {
  return FULL.format(new Date(iso));
}
