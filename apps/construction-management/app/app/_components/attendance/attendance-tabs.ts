/**
 * The Attendance submenu of a Project: Check-In first, so opening
 * Attendance lands there (ADR CM-0043 §7).
 */
export const ATTENDANCE_TABS = [
  { segment: "check-in", label: "Check-In" },
  { segment: "labour", label: "Labour" },
  { segment: "vendors", label: "Vendor" },
] as const;

/** The first Attendance tab, where opening Attendance lands. */
export const ATTENDANCE_HOME_SEGMENT = ATTENDANCE_TABS[0].segment;

/** The Attendance tabs as sidebar submenu links (ADR CM-0020). */
export function attendanceNavLinks(projectId: string) {
  const base = `/app/projects/${encodeURIComponent(projectId)}/attendance`;
  return ATTENDANCE_TABS.map((tab) => ({
    href: `${base}/${tab.segment}`,
    label: tab.label,
  }));
}
