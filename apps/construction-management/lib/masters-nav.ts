import {
  BadgeCheck,
  Building,
  Fence,
  Hammer,
  Handshake,
  HardHat,
  Settings2,
  Shovel,
  Truck,
  UserCheck,
  Users,
  Waves,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export type MastersSection = {
  href: string;
  /** Sidebar label; short enough for the submenu. */
  label: string;
  title: string;
  description: string;
  icon: LucideIcon;
};

export type MastersGroup = {
  label: string;
  sections: readonly MastersSection[];
};

/**
 * The Company's lists and settings under Masters, grouped the way the sidebar
 * submenu and the Masters page show them. Each milestone adds its masters to
 * a group (or a new group) here; nothing else needs to change.
 */
export const MASTERS_GROUPS: readonly MastersGroup[] = [
  {
    label: "Company",
    sections: [
      {
        href: "/app/masters/company",
        label: "Company profile",
        title: "Company profile",
        description: "Name, logo, GSTIN, PAN, address, currency and time zone.",
        icon: Building,
      },
      {
        href: "/app/masters/team-members",
        label: "Team Members",
        title: "Team Members",
        description:
          "Invite your team, choose their Projects and what each one may do.",
        icon: Users,
      },
      {
        href: "/app/masters/designations",
        label: "Designations",
        title: "Designations",
        description:
          "Job titles and the Permission Template each one starts with.",
        icon: BadgeCheck,
      },
      {
        href: "/app/masters/settings",
        label: "Settings",
        title: "Settings",
        description:
          "Sequence IDs, Back-dated Entry, billing addresses and GRN fields.",
        icon: Settings2,
      },
    ],
  },
  {
    label: "Parties",
    sections: [
      {
        href: "/app/masters/contractors",
        label: "Contractors",
        title: "Contractors",
        description:
          "Parties that execute work, by Department, and their Projects.",
        icon: Hammer,
      },
      {
        href: "/app/masters/suppliers",
        label: "Suppliers",
        title: "Suppliers",
        description: "Parties you buy material from, and their Projects.",
        icon: Truck,
      },
    ],
  },
  {
    label: "Labour & Vendors",
    sections: [
      {
        href: "/app/masters/labours",
        label: "Labours",
        title: "Labours",
        description:
          "Your own Labours: wage, Project, transfers and Excel import.",
        icon: Shovel,
      },
      {
        href: "/app/masters/vendors",
        label: "Vendors",
        title: "Vendors",
        description:
          "Labour gangs you hire by the head, with a rate card per shift.",
        icon: Handshake,
      },
      {
        href: "/app/masters/labour-categories",
        label: "Labour Categories",
        title: "Labour Categories",
        description:
          "Trades Labours and a Vendor's headcount are booked under.",
        icon: HardHat,
      },
      {
        href: "/app/masters/supervisors",
        label: "Supervisors",
        title: "Supervisors",
        description: "The people on site who look after a group of Labours.",
        icon: UserCheck,
      },
    ],
  },
  {
    label: "Work",
    sections: [
      {
        href: "/app/masters/departments",
        label: "Departments",
        title: "Departments",
        description: "Trades and work categories: RCC, Plumbing, Painting…",
        icon: Wrench,
      },
    ],
  },
  {
    label: "Projects",
    sections: [
      {
        href: "/app/masters/amenities",
        label: "Amenities",
        title: "Amenities",
        description:
          "Facilities a Project offers, like a pool or club house, and the Projects that have them.",
        icon: Waves,
      },
      {
        href: "/app/masters/common-developments",
        label: "Common Developments",
        title: "Common Developments",
        description:
          "Shared site works, like the compound wall or internal roads, and their Projects.",
        icon: Fence,
      },
    ],
  },
];

/** Every Masters section, in sidebar order. */
export const MASTERS_SECTIONS: readonly MastersSection[] =
  MASTERS_GROUPS.flatMap((group) => group.sections);

/** The section a Masters path belongs to (its page or anything under it). */
export function activeMastersSection(
  pathname: string,
): MastersSection | undefined {
  return MASTERS_SECTIONS.find(
    (section) =>
      pathname === section.href || pathname.startsWith(`${section.href}/`),
  );
}
