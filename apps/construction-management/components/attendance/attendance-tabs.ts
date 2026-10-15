/** Labour and Vendor attendance of a Project (CM-211, CM-213). */
export const ATTENDANCE_TABS = [
  { segment: "labour", label: "Labour" },
  { segment: "vendors", label: "Vendor" },
] as const;

/** The Attendance tabs as sidebar submenu links (ADR CM-0020). */
export function attendanceNavLinks(projectId: string) {
  const base = `/app/projects/${encodeURIComponent(projectId)}/attendance`;
  return ATTENDANCE_TABS.map((tab) => ({
    href: `${base}/${tab.segment}`,
    label: tab.label,
  }));
}
