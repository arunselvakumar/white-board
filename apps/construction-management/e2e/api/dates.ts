/** Today in India, `YYYY-MM-DD`, moved by `offsetDays` (the app's dates are the Company's). */
export function todayInIndia(offsetDays = 0): string {
  const now = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(
    now,
  );
}

/** The next Monday after today (a working day in the default HRMS week). */
export function nextMonday(weeksAhead = 1): string {
  const today = new Date(`${todayInIndia()}T00:00:00Z`);
  const daysToMonday =
    ((8 - today.getUTCDay()) % 7 || 7) + (weeksAhead - 1) * 7;
  return todayInIndia(daysToMonday);
}

/** `YYYY-MM-DD` plus `days`. */
export function addDays(date: string, days: number): string {
  const at = new Date(`${date}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}
