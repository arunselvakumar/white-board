export const CLASS_MODE_ITEMS = [
  { value: "offline", label: "Offline" },
  { value: "online", label: "Online" },
  { value: "hybrid", label: "Hybrid" },
] as const;

export type ClassModeValue = (typeof CLASS_MODE_ITEMS)[number]["value"];

export function classModeLabel(value: string): string {
  const item = CLASS_MODE_ITEMS.find((mode) => mode.value === value);
  return item?.label ?? value;
}

export const DAY_OF_WEEK_ITEMS = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
] as const;

export function formatTimingSlots(
  slots: { daysOfWeek: readonly number[]; startTime: string; endTime: string }[],
): string {
  return slots
    .map((slot) => {
      const days = slot.daysOfWeek
        .map(
          (day) =>
            DAY_OF_WEEK_ITEMS.find((item) => item.value === day)?.label ??
            String(day),
        )
        .join(", ");
      return `${days} ${slot.startTime}–${slot.endTime}`;
    })
    .join("; ");
}
