/** Pure helpers for the bell, the Notifications page and push (CM-904). */

/** The bell's badge text: the count, capped at "99+". */
export function unreadBadge(count: number): string {
  return count > 99 ? "99+" : String(count);
}

/** The bell's accessible name, e.g. "Notifications, 3 unread". */
export function bellLabel(count: number): string {
  return count > 0 ? `Notifications, ${String(count)} unread` : "Notifications";
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const dayMonth = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
});
const dayMonthYear = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** "Just now", "5 min ago", "2 hours ago", "Yesterday", "3 days ago", "12 Oct". */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const at = new Date(iso);
  const elapsed = now.getTime() - at.getTime();
  if (elapsed < MINUTE) return "Just now";
  if (elapsed < HOUR) return `${String(Math.floor(elapsed / MINUTE))} min ago`;
  if (elapsed < DAY) {
    const hours = Math.floor(elapsed / HOUR);
    return hours === 1 ? "1 hour ago" : `${String(hours)} hours ago`;
  }
  const days = Math.floor(elapsed / DAY);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${String(days)} days ago`;
  return at.getFullYear() === now.getFullYear()
    ? dayMonth.format(at)
    : dayMonthYear.format(at);
}

/**
 * A VAPID public key (base64url, as the server sends it) as the bytes
 * `PushManager.subscribe` takes for `applicationServerKey`.
 */
export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1)
    bytes[index] = binary.charCodeAt(index);
  return bytes;
}
