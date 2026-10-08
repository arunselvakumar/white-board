import {
  BadgeCheck,
  Building,
  Settings2,
  Users,
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
        description: "Sequence IDs and Back-dated Entry rules.",
        icon: Settings2,
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
