import { BOOKINGS_TABS, bookingsModulePath } from "@/src/queries/sales-units";

/**
 * The Bookings module's tabs as sidebar submenu links (M10, ADR CM-0020):
 * Units and Bookings. Both need Booking Read, which the module itself
 * needs, so every tab shows.
 */
export function bookingsNavLinks(projectId: string) {
  return BOOKINGS_TABS.map((tab) => ({
    href: bookingsModulePath(projectId, tab.segment),
    label: tab.label,
  }));
}
