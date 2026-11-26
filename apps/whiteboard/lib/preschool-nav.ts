import type { PreschoolRole } from "@/src/queries/preschool/me";

import type { AppBreadcrumb } from "./app-breadcrumbs";
import { preschoolHomeFor } from "./workspace-access";

// The Preschool sidebar (ADR-0055): picked by Institution Type, then by the
// Preschool role from `/api/preschool/me`. Items have the shape of
// `lib/app-nav.ts`; the shell maps each href to an icon.

const DASHBOARD = {
  href: "/preschool",
  label: "Dashboard",
  title: "Centre Dashboard",
  description:
    "Children present today, seats filled, fees collected, dues and follow-ups.",
} as const;
const ENQUIRIES = {
  href: "/preschool/enquiries",
  label: "Enquiries",
  title: "Enquiries",
  description: "Families asking about admission, and follow-ups due.",
} as const;
const CHILDREN = {
  href: "/preschool/children",
  label: "Children",
  title: "Children",
  description: "Children admitted to this Centre.",
} as const;
const ATTENDANCE = {
  href: "/preschool/attendance",
  label: "Attendance",
  title: "Attendance",
  description: "Check-in, check-out and who collected each Child.",
} as const;
const DAILY_REPORTS = {
  href: "/preschool/daily-reports",
  label: "Daily Reports",
  title: "Daily Reports",
  description: "Meals, nap, mood and activities for each Child, sent home.",
} as const;
const FEES = {
  href: "/preschool/fees",
  label: "Fees",
  title: "Fees",
  description: "Invoices, Fee Payments, Receipts and dues.",
} as const;
const ANNOUNCEMENTS = {
  href: "/preschool/announcements",
  label: "Announcements",
  title: "Announcements",
  description: "Notices, events and holidays for Parents.",
} as const;
const PROGRESS = {
  href: "/preschool/progress",
  label: "Progress",
  title: "Progress",
  description: "Observations and term Progress Reports.",
} as const;
const STOCK = {
  href: "/preschool/stock",
  label: "Stock",
  title: "Stock",
  description: "Books, uniforms and supplies on hand at this Centre.",
} as const;
const CLASSROOMS = {
  href: "/preschool/classrooms",
  label: "Classrooms",
  title: "Classrooms",
  description: "Classrooms in this Centre for the Academic Year, with seats.",
} as const;
const STAFF = {
  href: "/preschool/staff",
  label: "Staff",
  title: "Staff",
  description: "Centre Heads, Teachers and helpers.",
} as const;

const HEAD_OFFICE = {
  href: "/preschool/head-office",
  label: "Head Office",
  title: "Head Office",
  description: "Every Centre side by side.",
} as const;
const ROYALTY = {
  href: "/preschool/head-office/royalty",
  label: "Royalty",
  title: "Royalty Statements",
  description: "Royalty on collections for each Franchised Centre, by month.",
} as const;
const CENTRES = {
  href: "/preschool/centres",
  label: "Centres",
  title: "Centres",
  description: "Company-owned and Franchised Centres.",
} as const;
const PROGRAMMES = {
  href: "/preschool/programmes",
  label: "Programmes",
  title: "Programmes",
  description: "Playgroup, Nursery, LKG, UKG, Daycare and their age ranges.",
} as const;
const FEE_STRUCTURES = {
  href: "/preschool/fees/structures",
  label: "Fee Structures",
  title: "Fee Structures",
  description: "Amounts per Fee Head for each Programme and Academic Year.",
} as const;
const STOCK_ITEMS = {
  href: "/preschool/stock/items",
  label: "Stock Items",
  title: "Stock Items",
  description: "What every Centre keeps: books, uniforms, kits, supplies.",
} as const;

const TEACHER_HOME = {
  href: "/preschool/teacher",
  label: "Home",
  title: "Teacher Home",
  description: "Today's Classrooms, attendance and Daily Reports to send.",
} as const;
const FAMILY_HOME = {
  href: "/preschool/family",
  label: "Home",
  title: "Parent Home",
  description: "Today's status, Daily Reports, attendance and dues.",
} as const;
const FAMILY_DAILY_REPORTS = {
  href: "/preschool/family/daily-reports",
  label: "Daily Reports",
  title: "Daily Reports",
  description: "Meals, nap, mood and activities, day by day.",
} as const;
const FAMILY_ATTENDANCE = {
  href: "/preschool/family/attendance",
  label: "Attendance",
  title: "Attendance",
  description: "Days at school, and who collected your Child.",
} as const;
const FAMILY_FEES = {
  href: "/preschool/family/fees",
  label: "Fees",
  title: "Fees",
  description: "Fees due and Receipts for what you have paid.",
} as const;
const FAMILY_ANNOUNCEMENTS = {
  href: "/preschool/family/announcements",
  label: "Announcements",
  title: "Announcements",
  description: "Notices, events and holidays from the Centre.",
} as const;
const FAMILY_PROGRESS = {
  href: "/preschool/family/progress",
  label: "Progress",
  title: "Progress",
  description: "Progress Reports from your Child's Teachers.",
} as const;

/** The Owner's and a Centre Head's menu for the Centre they are in: daily work. */
export const PRESCHOOL_MANAGER_NAV = [
  DASHBOARD,
  ENQUIRIES,
  CHILDREN,
  ATTENDANCE,
  DAILY_REPORTS,
  FEES,
  ANNOUNCEMENTS,
  PROGRESS,
  STOCK,
] as const;

/** The Owner's view across Centres; only with several Centres. */
export const PRESCHOOL_HEAD_OFFICE_NAV = [HEAD_OFFICE, ROYALTY] as const;

/** Masters, set up once and rarely visited: the Owner's whole list. */
export const PRESCHOOL_SETUP_NAV = [
  CLASSROOMS,
  STAFF,
  CENTRES,
  PROGRAMMES,
  FEE_STRUCTURES,
  STOCK_ITEMS,
] as const;

/** A Centre Head sets up their Centre's Classrooms, Staff and fee amounts. */
const CENTRE_HEAD_SETUP_HREFS = new Set<string>([
  CLASSROOMS.href,
  STAFF.href,
  FEE_STRUCTURES.href,
]);

export const PRESCHOOL_TEACHER_NAV = [
  TEACHER_HOME,
  ATTENDANCE,
  DAILY_REPORTS,
  CHILDREN,
  PROGRESS,
  ANNOUNCEMENTS,
] as const;

export const PRESCHOOL_PARENT_NAV = [
  FAMILY_HOME,
  FAMILY_DAILY_REPORTS,
  FAMILY_ATTENDANCE,
  FAMILY_FEES,
  FAMILY_ANNOUNCEMENTS,
  FAMILY_PROGRESS,
] as const;

export type PreschoolNavItem =
  | (typeof PRESCHOOL_MANAGER_NAV)[number]
  | (typeof PRESCHOOL_HEAD_OFFICE_NAV)[number]
  | (typeof PRESCHOOL_SETUP_NAV)[number]
  | (typeof PRESCHOOL_TEACHER_NAV)[number]
  | (typeof PRESCHOOL_PARENT_NAV)[number];
export type PreschoolNavHref = PreschoolNavItem["href"];

const ALL_ITEMS: readonly PreschoolNavItem[] = [
  ...PRESCHOOL_MANAGER_NAV,
  ...PRESCHOOL_HEAD_OFFICE_NAV,
  ...PRESCHOOL_SETUP_NAV,
  ...PRESCHOOL_TEACHER_NAV,
  ...PRESCHOOL_PARENT_NAV,
];

/** Homes are active only on themselves; their pages have their own items. */
const HOME_HREFS = new Set<string>([
  DASHBOARD.href,
  TEACHER_HOME.href,
  FAMILY_HOME.href,
]);

/**
 * A Preschool sidebar in the order it is drawn: Head Office first, so the
 * Owner never has to scroll for it; the Centre's daily work; Setup last.
 */
export type PreschoolNav = {
  /** The Owner's, and only with several Centres. */
  headOffice: readonly PreschoolNavItem[];
  main: readonly PreschoolNavItem[];
  /** Empty for Teachers and Parents. */
  setup: readonly PreschoolNavItem[];
};

/** The sidebar for a Preschool role. */
export function preschoolNavFor(me: {
  role: PreschoolRole;
  hasSeveralCentres: boolean;
}): PreschoolNav {
  if (me.role === "parent")
    return { headOffice: [], main: PRESCHOOL_PARENT_NAV, setup: [] };
  if (me.role === "teacher")
    return { headOffice: [], main: PRESCHOOL_TEACHER_NAV, setup: [] };
  if (me.role === "centre_head")
    return {
      headOffice: [],
      main: PRESCHOOL_MANAGER_NAV,
      setup: PRESCHOOL_SETUP_NAV.filter((item) =>
        CENTRE_HEAD_SETUP_HREFS.has(item.href),
      ),
    };
  return {
    headOffice: me.hasSeveralCentres ? PRESCHOOL_HEAD_OFFICE_NAV : [],
    main: PRESCHOOL_MANAGER_NAV,
    setup: PRESCHOOL_SETUP_NAV,
  };
}

function covers(pathname: string, href: string): boolean {
  if (HOME_HREFS.has(href)) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The item the page belongs to: the longest href that covers the path, so
 * Fee Structures, not Fees, is active on `/preschool/fees/structures`.
 */
export function activePreschoolHref(
  pathname: string,
  hrefs: readonly string[] = ALL_ITEMS.map((item) => item.href),
): string | null {
  let best: string | null = null;
  for (const href of hrefs)
    if (covers(pathname, href) && (best == null || href.length > best.length))
      best = href;
  return best;
}

/** Title and description for a nav route, as its placeholder page shows them. */
export function preschoolPageByHref(href: PreschoolNavHref): PreschoolNavItem {
  const page = ALL_ITEMS.find((item) => item.href === href);
  if (page === undefined) throw new Error(`Unknown Preschool route: ${href}`);
  return page;
}

/** What one record of a list is called, for "Add …" and the record's crumb. */
const SINGULAR: Partial<Record<PreschoolNavHref, string>> = {
  [ENQUIRIES.href]: "Enquiry",
  [CHILDREN.href]: "Child",
  [ANNOUNCEMENTS.href]: "Announcement",
  [CLASSROOMS.href]: "Classroom",
  [STAFF.href]: "Staff member",
  [CENTRES.href]: "Centre",
  [PROGRAMMES.href]: "Programme",
  [FEE_STRUCTURES.href]: "Fee Structure",
  [STOCK_ITEMS.href]: "Stock Item",
  [FAMILY_ANNOUNCEMENTS.href]: "Announcement",
  [FAMILY_PROGRESS.href]: "Progress Report",
  [ROYALTY.href]: "Centre statement",
};

/**
 * Records that live one segment below a nav item, by that segment:
 * `/preschool/fees/receipts/<id>` is a Receipt, not a Fee.
 */
const NESTED_RECORD: Partial<
  Record<PreschoolNavHref, Readonly<Record<string, string>>>
> = {
  [FEES.href]: { receipts: "Receipt", children: "Fee account" },
  [PROGRESS.href]: { reports: "Progress Report" },
};

/**
 * Breadcrumbs for a Preschool page: the role's Home, the nav item the page
 * belongs to, then "Add …" or the record.
 */
export function preschoolBreadcrumbs(
  pathname: string,
  role: PreschoolRole | null | undefined,
): AppBreadcrumb[] {
  const homeHref = preschoolHomeFor(role ?? "owner");
  const home = preschoolPageByHref(homeHref as PreschoolNavHref);
  const homeCrumb = { label: home.label, href: home.href };
  const href = activePreschoolHref(pathname);
  if (href == null || href === homeHref) return [homeCrumb];
  const item = preschoolPageByHref(href as PreschoolNavHref);
  const crumbs: AppBreadcrumb[] = [
    homeCrumb,
    { label: item.label, href: item.href },
  ];
  if (pathname === href) return crumbs;
  const rest = pathname.slice(href.length + 1).split("/");
  const nested = NESTED_RECORD[item.href]?.[rest[0] ?? ""];
  if (nested != null) {
    crumbs.push({ label: nested });
    return crumbs;
  }
  const singular = SINGULAR[item.href] ?? item.label;
  crumbs.push({ label: rest[0] === "new" ? `Add ${singular}` : singular });
  return crumbs;
}
