import { formatCalendarDate } from "@/app/app/_components/projects/project-status";

/** "L-001 · Mason", or null when they have neither. */
export function labourDetail(labour: {
  labourCode: string | null;
  labourCategory: { name: string } | null;
}): string | null {
  const parts = [labour.labourCode, labour.labourCategory?.name].filter(
    (part): part is string => part != null && part !== "",
  );
  return parts.length === 0 ? null : parts.join(" · ");
}

/** "Since 2 Mar 2026". */
export function sinceLabel(since: string): string {
  return `Since ${formatCalendarDate(since)}`;
}

export function labourPath(id: string): string {
  return `/app/staff/labours/${encodeURIComponent(id)}`;
}
