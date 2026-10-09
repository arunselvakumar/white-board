/** "9 Oct 2026" — a calendar date (YYYY-MM-DD), read as written. */
export function feeDateLabel(key: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${key}T00:00:00.000Z`));
}

/** "Due today", "1 day overdue", "4 days overdue". */
export function followUpDueLabel(daysOverdue: number): string {
  if (daysOverdue <= 0) return "Due today";
  return `${daysOverdue} ${daysOverdue === 1 ? "day" : "days"} overdue`;
}
