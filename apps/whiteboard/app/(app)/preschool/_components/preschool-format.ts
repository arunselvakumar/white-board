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
