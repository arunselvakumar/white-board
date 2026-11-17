import { type AppHref, pageHref } from "@/lib/page-href";

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

type AttendanceTabSegment = (typeof ATTENDANCE_TABS)[number]["segment"];

/** Each tab's page, named by its folder (ADR CM-0045). */
const ATTENDANCE_TAB_PAGES: Record<
  AttendanceTabSegment,
  (id: string) => AppHref
> = {
  "check-in": (id) =>
    pageHref("/app/projects/[id]/attendance/check-in", { id }),
  labour: (id) => pageHref("/app/projects/[id]/attendance/labour", { id }),
  vendors: (id) => pageHref("/app/projects/[id]/attendance/vendors", { id }),
};

/** One Attendance tab's page for a Project. */
export function attendanceTabHref(
  projectId: string,
  segment: AttendanceTabSegment,
): AppHref {
  return ATTENDANCE_TAB_PAGES[segment](projectId);
}

/** The Attendance tabs as sidebar submenu links (ADR CM-0020). */
export function attendanceNavLinks(projectId: string) {
  return ATTENDANCE_TABS.map((tab) => ({
    href: ATTENDANCE_TAB_PAGES[tab.segment](projectId),
    label: tab.label,
  }));
}
