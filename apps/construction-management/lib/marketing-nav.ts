import {
  Building,
  CalendarClock,
  Contact,
  FileChartColumn,
  LayoutDashboard,
  MapPinned,
  type LucideIcon,
} from "lucide-react";

/** Marketing (ADR CM-0040 §1): every page of the area lives under it. */
export const MARKETING_PATH = "/app/marketing";

export const MARKETING_VISITS_PATH = `${MARKETING_PATH}/visits`;
export const MARKETING_FOLLOW_UPS_PATH = `${MARKETING_PATH}/follow-ups`;
export const MARKETING_COMPANIES_PATH = `${MARKETING_PATH}/companies`;
export const MARKETING_TEAM_PATH = `${MARKETING_PATH}/team`;
export const MARKETING_REPORTS_PATH = `${MARKETING_PATH}/reports`;

/** Which Marketing entries the viewer's Role opens (ADR CM-0040 §1). */
export type MarketingMenuAccess = {
  /** Dashboard Read. */
  dashboard: boolean;
  /** Visits Read. */
  visits: boolean;
  /** Follow-ups Read. */
  followUps: boolean;
  /** Companies Read. */
  companies: boolean;
  /** Team Read. */
  team: boolean;
  /** Report on Visits. */
  reports: boolean;
};

export const NO_MARKETING_ACCESS: MarketingMenuAccess = {
  dashboard: false,
  visits: false,
  followUps: false,
  companies: false,
  team: false,
  reports: false,
};

export const FULL_MARKETING_ACCESS: MarketingMenuAccess = {
  dashboard: true,
  visits: true,
  followUps: true,
  companies: true,
  team: true,
  reports: true,
};

export type MarketingSection = {
  key: keyof MarketingMenuAccess;
  href: string;
  /** Sidebar label. */
  label: string;
  title: string;
  description: string;
  icon: LucideIcon;
};

export const MARKETING_SECTIONS: readonly MarketingSection[] = [
  {
    key: "dashboard",
    href: MARKETING_PATH,
    label: "Dashboard",
    title: "Marketing Dashboard",
    description:
      "Visits completed, planned and missed, Follow-ups due, and Prospect Companies by Stage.",
    icon: LayoutDashboard,
  },
  {
    key: "visits",
    href: MARKETING_VISITS_PATH,
    label: "Visits",
    title: "Visits",
    description:
      "Planned and completed Visits to Prospect Companies, with notes, photos and the people met.",
    icon: MapPinned,
  },
  {
    key: "followUps",
    href: MARKETING_FOLLOW_UPS_PATH,
    label: "Follow-ups",
    title: "Follow-ups",
    description:
      "Calls, return Visits, emails and quotations owed after a Visit, by due date.",
    icon: CalendarClock,
  },
  {
    key: "companies",
    href: MARKETING_COMPANIES_PATH,
    label: "Companies",
    title: "Prospect Companies",
    description:
      "The companies your marketing team visits to win work, their Contacts and their Stage.",
    icon: Building,
  },
  {
    key: "team",
    href: MARKETING_TEAM_PATH,
    label: "Team",
    title: "Marketing Team",
    description:
      "Your Marketing People: Visits this month against target, Follow-ups overdue and their last Visit.",
    icon: Contact,
  },
  {
    key: "reports",
    href: MARKETING_REPORTS_PATH,
    label: "Reports",
    title: "Marketing Reports",
    description:
      "The Visit register, the Marketing Person summary and the Company pipeline, in Excel and PDF.",
    icon: FileChartColumn,
  },
];

/** The entries the viewer may open, in menu order. */
export function marketingSections(
  access: MarketingMenuAccess,
): readonly MarketingSection[] {
  return MARKETING_SECTIONS.filter((section) => access[section.key]);
}

export function marketingSection(
  key: MarketingSection["key"],
): MarketingSection {
  const section = MARKETING_SECTIONS.find((item) => item.key === key);
  if (section == null) throw new Error(`No Marketing section ${key}`);
  return section;
}

/**
 * The Marketing entry a path belongs to: its page or anything under it.
 * The Dashboard is the area's own address, so only that exact path is it.
 */
export function activeMarketingSection(
  pathname: string,
): MarketingSection | undefined {
  return MARKETING_SECTIONS.find((section) =>
    section.href === MARKETING_PATH
      ? pathname === MARKETING_PATH
      : pathname === section.href || pathname.startsWith(`${section.href}/`),
  );
}
