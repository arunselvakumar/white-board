import { formatMobile } from "@repo/auth/construction/mobile";

import { projectBasePath } from "@/lib/project-nav";
import type {
  CheckInAction,
  CheckInEntry,
  CheckInKind,
  CheckInPerson,
} from "@/src/queries/check-ins";

/** `site_engineer` in the API is `site-engineer` in the address. */
export const KIND_SEGMENTS: Record<CheckInKind, string> = {
  labour: "labour",
  site_engineer: "site-engineer",
  vendor: "vendor",
};

/** The three groups, in the order the find screen lists them. */
export const KIND_ORDER: readonly CheckInKind[] = [
  "site_engineer",
  "labour",
  "vendor",
];

export function kindFromSegment(segment: string): CheckInKind | null {
  return KIND_ORDER.find((kind) => KIND_SEGMENTS[kind] === segment) ?? null;
}

export const KIND_PLURALS: Record<CheckInKind, string> = {
  site_engineer: "Site Engineers",
  labour: "Labours",
  vendor: "Vendors",
};

export const ACTION_LABELS: Record<CheckInAction, string> = {
  check_in: "Check In",
  check_out: "Check Out",
};

export function checkInBasePath(projectId: string): string {
  return `${projectBasePath(projectId)}/attendance/check-in`;
}

/** The find screen, with the typed search when there is one. */
export function checkInFindPath(projectId: string, q = ""): string {
  const query = q.trim() === "" ? "" : `?${new URLSearchParams({ q })}`;
  return `${checkInBasePath(projectId)}${query}`;
}

export function checkInCapturePath(
  projectId: string,
  person: { kind: CheckInKind; id: string },
  q = "",
): string {
  const query = q.trim() === "" ? "" : `?${new URLSearchParams({ q })}`;
  return `${checkInBasePath(projectId)}/${KIND_SEGMENTS[person.kind]}/${encodeURIComponent(person.id)}${query}`;
}

export function checkInLogPath(projectId: string): string {
  return `${checkInBasePath(projectId)}/log`;
}

const formats = new Map<string, Intl.DateTimeFormat>();

function format(
  timeZone: string,
  key: string,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const id = `${key}|${timeZone}`;
  let found = formats.get(id);
  if (found == null) {
    found = new Intl.DateTimeFormat("en-IN", { ...options, timeZone });
    formats.set(id, found);
  }
  return found;
}

/** ICU puts a narrow no-break space before am/pm; screens and tests want a space. */
function plain(text: string): string {
  return text.replace(/\s+/g, " ").toLowerCase();
}

/** `10:02 am` in the Company's time zone. */
export function formatTime(at: string | number, timeZone: string): string {
  return plain(
    format(timeZone, "time", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(at)),
  );
}

/** `10:02:15 am`, for the clock. */
export function formatClockTime(at: number, timeZone: string): string {
  return plain(
    format(timeZone, "clock", {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    }).format(new Date(at)),
  );
}

/** `Saturday, 14 Nov 2026` in the Company's time zone. */
export function formatLongDate(at: number, timeZone: string): string {
  return format(timeZone, "date", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(at));
}

/** `Saturday, 14 Nov 2026` for a `YYYY-MM-DD` calendar date. */
export function formatCalendarDate(date: string): string {
  return formatLongDate(Date.parse(`${date}T12:00:00Z`), "UTC");
}

/** Up to two initials: "Murugan Ganesan" → "MG". */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0]?.[0] ?? "?";
  const last = words.length > 1 ? (words.at(-1)?.[0] ?? "") : "";
  return `${first}${last}`.toUpperCase();
}

/** `Mason · L-0042 · +91 98765 43210`: what is known of role, ID and phone. */
export function personLine(person: CheckInPerson): string {
  return [
    person.role,
    person.code,
    person.phone == null ? null : formatMobile(person.phone),
  ]
    .filter((part): part is string => part != null && part !== "")
    .join(" · ");
}

/** "In since 10:02 am", "Out since 1:05 pm" or "Not checked in today". */
export function stateSentence(person: CheckInPerson, timeZone: string): string {
  const { status, since } = person.state;
  if (status === "in" && since != null)
    return `In since ${formatTime(since, timeZone)}`;
  if (status === "out" && since != null)
    return `Out since ${formatTime(since, timeZone)}`;
  return "Not checked in today";
}

/** The fence result of a saved entry, or null without a location or fence. */
export function fenceSentence(
  entry: Pick<CheckInEntry, "fence" | "metresOutside">,
): string | null {
  if (entry.fence === "inside") return "Inside the site fence";
  if (entry.fence === "outside")
    return `About ${(entry.metresOutside ?? 0).toLocaleString("en-IN")} m outside the site fence`;
  return null;
}

/** Google Maps at a point, for "Open in Maps". */
export function mapsUrl(location: {
  latitude: number;
  longitude: number;
}): string {
  return `https://www.google.com/maps?q=${String(location.latitude)},${String(location.longitude)}`;
}
