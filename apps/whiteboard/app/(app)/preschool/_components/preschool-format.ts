// Display helpers shared by Preschool screens. Dates arrive as YYYY-MM-DD.

/** "25 Nov 2026"; "—" for none. */
export function formatDate(date: string | null | undefined): string {
  if (date == null || date === "") return "—";
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "25 Nov, 3:40 pm" for an instant, in India. */
export function formatDateTime(instant: string): string {
  return new Date(instant).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}

export function plural(count: number, one: string, many: string): string {
  return `${String(count)} ${count === 1 ? one : many}`;
}

/**
 * A clock time as people read it in India: "09:05" → "9:05 am", "23:22" →
 * "11:22 pm". The API's "HH:mm" stays as it is everywhere else.
 */
export function formatClockTime(time: string): string {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  const hour = hours % 12 === 0 ? 12 : hours % 12;
  return `${String(hour)}:${String(minutes).padStart(2, "0")} ${hours < 12 ? "am" : "pm"}`;
}
