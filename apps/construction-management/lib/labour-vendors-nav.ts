import {
  Handshake,
  HardHat,
  Shovel,
  UserCheck,
  type LucideIcon,
} from "lucide-react";

export type LabourVendorsSection = {
  href: string;
  /** Sidebar label. */
  label: string;
  title: string;
  description: string;
  icon: LucideIcon;
};

export const LABOURS_PAGE_PATH = "/app/labours";

/**
 * The Labour group of Human Resources (ADR CM-0034): your own
 * Labours, the Vendors you hire gangs from, and the lists both are booked
 * under. The area opens on Labours.
 */
export const LABOUR_VENDORS_SECTIONS: readonly LabourVendorsSection[] = [
  {
    href: LABOURS_PAGE_PATH,
    label: "Labours",
    title: "Labours",
    description: "Your own Labours: wage, Project, transfers and Excel import.",
    icon: Shovel,
  },
  {
    href: "/app/vendors",
    label: "Vendors",
    title: "Vendors",
    description:
      "Labour gangs you hire by the head, with a rate card per shift.",
    icon: Handshake,
  },
  {
    href: "/app/labour-categories",
    label: "Labour Categories",
    title: "Labour Categories",
    description: "Trades Labours and a Vendor's headcount are booked under.",
    icon: HardHat,
  },
  {
    href: "/app/supervisors",
    label: "Supervisors",
    title: "Supervisors",
    description: "The people on site who look after a group of Labours.",
    icon: UserCheck,
  },
];

/** The Labour section a path belongs to (its page or anything under it). */
export function activeLabourVendorsSection(
  pathname: string,
): LabourVendorsSection | undefined {
  return LABOUR_VENDORS_SECTIONS.find(
    (section) =>
      pathname === section.href || pathname.startsWith(`${section.href}/`),
  );
}
