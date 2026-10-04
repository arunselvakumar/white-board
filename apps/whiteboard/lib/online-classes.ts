import {
  addDays,
  dateKeyInZone,
  expandCalendarItems,
  type CalendarEvent,
} from "./calendar-dates";

type ScheduledOnlineClass = {
  id: string;
  timezone: string;
  activeFrom: string;
  classMode: "offline" | "online" | "hybrid";
  timings: {
    daysOfWeek: readonly number[];
    startTime: string;
    endTime: string;
  }[];
};

export function upcomingOnlineClasses<T extends ScheduledOnlineClass>(
  items: readonly T[],
  now: Date,
  days = 30,
): CalendarEvent<T>[] {
  const events = items
    .filter((item) => item.classMode !== "offline")
    .flatMap((item) => {
      const firstDate = dateKeyInZone(now, item.timezone);
      const dates = Array.from({ length: days }, (_, index) =>
        addDays(firstDate, index),
      );
      return expandCalendarItems([item], dates);
    });

  return events.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.startMinutes - b.startMinutes ||
      a.item.id.localeCompare(b.item.id),
  );
}
