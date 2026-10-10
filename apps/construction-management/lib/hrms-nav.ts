import {
  CalendarClock,
  CalendarDays,
  CalendarHeart,
  CalendarOff,
  Clock,
  IdCard,
  Layers,
  LayoutDashboard,
  ListChecks,
  MapPin,
  Receipt,
  Scale,
  Settings2,
  UserRound,
  Users,
  Wallet,
  WalletCards,
  type LucideIcon,
} from "lucide-react";

/** Where HRMS lives: Workspace → HRMS (`modules/10` "Workspace placement"). */
export const HRMS_PATH = "/app/workspace/hrms";

export type HrmsPage = {
  href: string;
  /** Tab label; short. */
  label: string;
  /** Page title. */
  title: string;
  description: string;
  icon: LucideIcon;
  /** The M3 ticket that builds the screen. */
  ticket: string;
};

export type HrmsSectionKey =
  "dashboard" | "attendance" | "leave" | "salary" | "configuration";

export type HrmsSection = {
  key: HrmsSectionKey;
  label: string;
  /** The section's own path; a section with several pages redirects to the first. */
  href: string;
  icon: LucideIcon;
  description: string;
  pages: readonly HrmsPage[];
};

const ATTENDANCE = `${HRMS_PATH}/attendance`;
const LEAVE = `${HRMS_PATH}/leave`;
const SALARY = `${HRMS_PATH}/salary`;
const CONFIGURATION = `${HRMS_PATH}/configuration`;

/**
 * The HRMS area: its sections (the tabs under HRMS and the sidebar's
 * Workspace submenu) and each section's pages (the sub-tabs). This is the
 * one place HRMS navigation is defined. To build a screen, replace the
 * `HrmsComingSoon` in its `page.tsx`; to add a screen, add a page here and
 * its `page.tsx` under `app/app/workspace/hrms/`.
 */
export const HRMS_SECTIONS: readonly HrmsSection[] = [
  {
    key: "dashboard",
    label: "Dashboard",
    href: HRMS_PATH,
    icon: LayoutDashboard,
    description: "Who is in today, who is on leave, and what waits for you.",
    pages: [
      {
        href: HRMS_PATH,
        label: "Dashboard",
        title: "HRMS Dashboard",
        description:
          "Today's snapshot (present, on leave, employees), the present/absent breakdown, the day-wise trend and pending approvals.",
        icon: LayoutDashboard,
        ticket: "CM-319",
      },
    ],
  },
  {
    key: "attendance",
    label: "Attendance",
    href: ATTENDANCE,
    icon: Clock,
    description: "Check in and out, team attendance and approvals.",
    pages: [
      {
        href: `${ATTENDANCE}/my`,
        label: "My Attendance",
        title: "My Attendance",
        description:
          "Check in and out inside your office or site fence, close a missed checkout and add a back-dated day.",
        icon: UserRound,
        ticket: "CM-309",
      },
      {
        href: `${ATTENDANCE}/team`,
        label: "Team",
        title: "Team Attendance",
        description: "Today's status of everyone you can see.",
        icon: Users,
        ticket: "CM-309",
      },
      {
        href: `${ATTENDANCE}/approvals`,
        label: "Approvals",
        title: "Attendance Approvals",
        description:
          "Back-dated days, missed checkouts and out-of-fence check-ins waiting for a decision.",
        icon: ListChecks,
        ticket: "CM-309",
      },
      {
        href: `${ATTENDANCE}/monthly`,
        label: "Monthly",
        title: "Monthly Attendance",
        description:
          "Each member's month: present, half days, absent, leave, holidays and hours.",
        icon: CalendarDays,
        ticket: "CM-309",
      },
    ],
  },
  {
    key: "leave",
    label: "Leave",
    href: LEAVE,
    icon: CalendarOff,
    description: "Apply for leave, approve requests and see who is away.",
    pages: [
      {
        href: `${LEAVE}/my`,
        label: "My Leaves",
        title: "My Leaves",
        description:
          "Apply for leave, see your balances and credit history, and ask to cancel.",
        icon: UserRound,
        ticket: "CM-313",
      },
      {
        href: `${LEAVE}/approvals`,
        label: "Approvals",
        title: "Leave Approvals",
        description:
          "Pending, approved and rejected requests, and cancellation requests.",
        icon: ListChecks,
        ticket: "CM-313",
      },
      {
        href: `${LEAVE}/team`,
        label: "Team",
        title: "Team Leaves",
        description: "Who is on leave, and when.",
        icon: Users,
        ticket: "CM-313",
      },
    ],
  },
  {
    key: "salary",
    label: "Salary",
    href: SALARY,
    icon: Wallet,
    description: "Monthly salary, advances and payslips.",
    pages: [
      {
        href: `${SALARY}/my`,
        label: "My Salary",
        title: "My Salary",
        description: "Your payslips, month by month.",
        icon: Receipt,
        ticket: "CM-317",
      },
      {
        href: `${SALARY}/team`,
        label: "Team Salary",
        title: "Team Salary",
        description:
          "Calculate the month's salary, pay an advance, approve and mark salaries paid.",
        icon: WalletCards,
        ticket: "CM-317",
      },
    ],
  },
  {
    key: "configuration",
    label: "Configuration",
    href: CONFIGURATION,
    icon: Settings2,
    description: "Settings, fences, holidays, shifts, leave and salary set-up.",
    pages: [
      {
        href: `${CONFIGURATION}/settings`,
        label: "Settings",
        title: "HRMS Settings",
        description:
          "GPS check-in, grace period, working hours and days, leave rules and salary day.",
        icon: Settings2,
        ticket: "CM-303",
      },
      {
        href: `${CONFIGURATION}/branches`,
        label: "Branches & Sites",
        title: "Branches & Sites",
        description:
          "Office branches and Project site fences people check in at.",
        icon: MapPin,
        ticket: "CM-304",
      },
      {
        href: `${CONFIGURATION}/holidays`,
        label: "Holidays",
        title: "Holidays",
        description:
          "National, festival and Company holidays; import from Excel.",
        icon: CalendarHeart,
        ticket: "CM-305",
      },
      {
        href: `${CONFIGURATION}/shifts`,
        label: "Shifts",
        title: "Shifts",
        description: "Shift templates and rotations.",
        icon: Clock,
        ticket: "CM-306",
      },
      {
        href: `${CONFIGURATION}/shift-management`,
        label: "Shift Management",
        title: "Shift Management",
        description: "Who works which shift or rotation, until changed.",
        icon: CalendarClock,
        ticket: "CM-307",
      },
      {
        href: `${CONFIGURATION}/leave-types`,
        label: "Leave Types & Structures",
        title: "Leave Types & Structures",
        description:
          "Kinds of leave, how they are credited, and the bundles members get.",
        icon: Layers,
        ticket: "CM-310",
      },
      {
        href: `${CONFIGURATION}/leave-balances`,
        label: "Leave Balances",
        title: "Leave Balances",
        description:
          "Each member's balances: initialise, accrue, carry forward and adjust.",
        icon: Scale,
        ticket: "CM-311",
      },
      {
        href: `${CONFIGURATION}/salary-structures`,
        label: "Salary Structures",
        title: "Salary Structures",
        description:
          "Earnings components, PF, ESI, professional tax and other deductions.",
        icon: Receipt,
        ticket: "CM-314",
      },
      {
        href: `${CONFIGURATION}/employees`,
        label: "Employees",
        title: "Employees",
        description:
          "Each member's salary structure and base salary: Configured or Not Set.",
        icon: IdCard,
        ticket: "CM-315",
      },
    ],
  },
];

/** Every HRMS page, in navigation order. */
export const HRMS_PAGES: readonly HrmsPage[] = HRMS_SECTIONS.flatMap(
  (section) => section.pages,
);

function within(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The section a path belongs to; the Dashboard only on the HRMS page itself. */
export function activeHrmsSection(pathname: string): HrmsSection | undefined {
  return (
    HRMS_SECTIONS.find(
      (section) =>
        section.key !== "dashboard" && within(pathname, section.href),
    ) ?? (pathname === HRMS_PATH ? HRMS_SECTIONS[0] : undefined)
  );
}

/** The page a path belongs to (its page or anything under it). */
export function activeHrmsPage(pathname: string): HrmsPage | undefined {
  return activeHrmsSection(pathname)?.pages.find((page) =>
    page.href === HRMS_PATH
      ? pathname === HRMS_PATH
      : within(pathname, page.href),
  );
}

/** A page by its href; for page metadata and placeholders. */
export function hrmsPage(href: string): HrmsPage {
  const page = HRMS_PAGES.find((item) => item.href === href);
  if (page == null) throw new Error(`No HRMS page for ${href}`);
  return page;
}
