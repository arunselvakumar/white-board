import { Badge } from "@repo/ui/components/badge";

import type { ProjectStatus } from "@/src/queries/projects";

/** Chip and list order: work in hand first, finished work last. */
export const PROJECT_STATUS_ORDER = [
  "ongoing",
  "not_started",
  "on_hold",
  "completed",
] as const satisfies readonly ProjectStatus[];

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  ongoing: "Ongoing",
  not_started: "Not started",
  on_hold: "On hold",
  completed: "Completed",
};

const VARIANTS = {
  ongoing: "default",
  not_started: "secondary",
  on_hold: "outline",
  completed: "secondary",
} as const satisfies Record<ProjectStatus, string>;

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  return (
    <Badge variant={VARIANTS[status]}>{PROJECT_STATUS_LABELS[status]}</Badge>
  );
}

const DATE_FORMAT = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** `2026-04-01` → "1 Apr 2026". Calendar dates have no time zone. */
export function formatCalendarDate(value: string): string {
  return DATE_FORMAT.format(new Date(`${value}T00:00:00Z`));
}

/** "1 Apr 2026 – 31 Mar 2027", "From 1 Apr 2026", "Until …", or null. */
export function projectDates(project: {
  startDate: string | null;
  endDate: string | null;
}): string | null {
  const { startDate, endDate } = project;
  if (startDate != null && endDate != null)
    return `${formatCalendarDate(startDate)} – ${formatCalendarDate(endDate)}`;
  if (startDate != null) return `From ${formatCalendarDate(startDate)}`;
  if (endDate != null) return `Until ${formatCalendarDate(endDate)}`;
  return null;
}

/** Up to two letters for a Project's avatar. */
export function projectInitials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  const letters =
    words.length > 1
      ? `${words[0]?.[0] ?? ""}${words[1]?.[0] ?? ""}`
      : name.slice(0, 2);
  return letters.toUpperCase();
}
