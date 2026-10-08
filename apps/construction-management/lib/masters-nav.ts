import {
  BadgeCheck,
  Building,
  Settings2,
  Users,
  type LucideIcon,
} from "lucide-react";

/** The Company's lists and settings under Masters (M1; more arrive with M2+). */
export const MASTERS_SECTIONS: readonly {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
}[] = [
  {
    href: "/app/masters/team-members",
    title: "Team Members",
    description:
      "Invite your team, choose their Projects and what each one may do.",
    icon: Users,
  },
  {
    href: "/app/masters/designations",
    title: "Designations",
    description: "Job titles and the Permission Template each one starts with.",
    icon: BadgeCheck,
  },
  {
    href: "/app/masters/company",
    title: "Company profile",
    description: "Name, logo, GSTIN, PAN, address, currency and time zone.",
    icon: Building,
  },
  {
    href: "/app/masters/settings",
    title: "Settings",
    description: "Sequence IDs and Back-dated Entry rules.",
    icon: Settings2,
  },
];
