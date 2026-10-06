import type { ScheduledClass } from "@/src/training-institute/domain/class-schedule";

import {
  addDays,
  formatDate,
  minutesFromClock,
  type CalendarEvent,
  type DateKey,
} from "./calendar-dates";

export function clockLabel(clock: string): string {
  const minutes = minutesFromClock(clock);
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
}

export function slotLabel(slot: { date: string; startTime: string }): string {
  return `${formatDate(slot.date, { weekday: "short", month: "short", day: "numeric" })} · ${clockLabel(slot.startTime)}`;
}

/** True when the Class won't happen at this slot. */
export function isOff(scheduled: ScheduledClass): boolean {
  return scheduled.status !== "scheduled";
}

/** Short marker shown on a Class card. */
export function classMarker(scheduled: ScheduledClass): string | null {
  if (scheduled.status === "cancelled") return "Cancelled";
  if (scheduled.status === "holiday") return "Holiday";
  if (scheduled.status === "moved") return "Moved";
  if (scheduled.rescheduled) return "Rescheduled";
  return null;
}

/** One sentence explaining what changed, with the reason when there is one. */
export function classChangeSummary(scheduled: ScheduledClass): string | null {
  const reason = scheduled.reason ? ` · ${scheduled.reason}` : "";
  const movedTo = scheduled.change?.movedTo;
  if (scheduled.status === "holiday") return `Holiday${reason}`;
  if (scheduled.status === "moved" && movedTo != null)
    return `Moved to ${slotLabel(movedTo)}${reason}`;
  if (scheduled.status === "cancelled") return `Cancelled${reason}`;
  if (scheduled.rescheduled && scheduled.change != null)
    return `Rescheduled from ${slotLabel(scheduled.change)}${reason}`;
  return null;
}

type ChangeItem = {
  id: string;
  courseName: string;
  batchName: string;
  studentName: string | null;
};

export type UpcomingChange<T extends ChangeItem = ChangeItem> =
  | {
      kind: "class";
      id: string;
      date: DateKey;
      event: CalendarEvent<T>;
      summary: string;
    }
  | {
      kind: "holiday";
      id: string;
      date: DateKey;
      startDate: DateKey;
      endDate: DateKey;
      reason: string | null;
    };

/**
 * Cancelled and Moved Classes and Holidays from today through the next
 * `days` days. A Moved Class is listed once, at its original slot, unless only
 * its new slot falls in the window.
 */
export function upcomingChanges<T extends ChangeItem>(
  events: CalendarEvent<T>[],
  holidays: readonly {
    id: string;
    startDate: string;
    endDate: string;
    reason: string | null;
  }[],
  today: DateKey,
  days = 14,
): UpcomingChange<T>[] {
  const last = addDays(today, days - 1);
  const listedChanges = new Set<string>();
  const result: UpcomingChange<T>[] = [];
  for (const holiday of holidays) {
    if (holiday.endDate < today || holiday.startDate > last) continue;
    result.push({
      kind: "holiday",
      id: holiday.id,
      date: holiday.startDate < today ? today : holiday.startDate,
      startDate: holiday.startDate,
      endDate: holiday.endDate,
      reason: holiday.reason,
    });
  }
  const sorted = [...events].sort(
    (a, b) => Number(a.scheduled.rescheduled) - Number(b.scheduled.rescheduled),
  );
  for (const event of sorted) {
    const { scheduled } = event;
    if (event.date < today || event.date > last) continue;
    // Holiday Classes are covered by the Holiday entry.
    if (scheduled.status === "holiday") continue;
    if (scheduled.status === "scheduled" && !scheduled.rescheduled) continue;
    const key = `${event.item.id}:${scheduled.change?.id ?? event.id}`;
    if (listedChanges.has(key)) continue;
    listedChanges.add(key);
    result.push({
      kind: "class",
      id: event.id,
      date: event.date,
      event,
      summary: classChangeSummary(scheduled) ?? "",
    });
  }
  return result.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.kind === "holiday" ? -1 : 0) - (b.kind === "holiday" ? -1 : 0),
  );
}
