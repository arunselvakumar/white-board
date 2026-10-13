// The Reports catalogue (Reports PRD §4, §5, §6.10): which reports exist,
// who may open each, which filters it takes, and how it can leave the
// screen. The server enforces it; the Reports screens read it to build their
// pages. Keep this file free of server-only imports.

export const REPORT_KEYS = [
  "student-attendance",
  "attendance-register",
  "low-attendance",
  "absence-notices",
  "pending-attendance",
  "teacher-classes",
  "batch-strength",
  "collections",
  "dues",
  "receipts",
  "fee-statement",
  "enquiry-funnel",
  "demo-classes",
  "online-classes",
  "test-results",
  "batch-tests",
  "homework",
  "monthly-student",
  "monthly-review",
] as const;

export type ReportKey = (typeof REPORT_KEYS)[number];

export type ReportRole = "owner" | "teacher" | "student" | "parent";

export type ReportGroup =
  | "attendance"
  | "teaching"
  | "batches"
  | "fees"
  | "enquiries"
  | "online"
  | "tests"
  | "homework"
  | "combined";

export const REPORT_GROUP_LABELS: Record<ReportGroup, string> = {
  attendance: "Attendance",
  teaching: "Teaching",
  batches: "Batches and Courses",
  fees: "Fees",
  enquiries: "Enquiries and Demos",
  online: "Online Classes",
  tests: "Tests",
  homework: "Homework",
  combined: "Monthly reports",
};

/** A filter a report takes, named as in the query string. */
export type ReportFilter =
  | "period"
  | "month"
  | "student"
  | "enrollment"
  | "batch"
  | "course"
  | "teacher"
  | "classMode"
  | "method"
  | "recordedBy"
  | "source"
  | "addedBy"
  | "reason"
  | "givenBy"
  | "demoKind"
  | "demoFee"
  | "demoAttendance"
  | "meeting"
  | "dueFilter"
  | "ageGroup"
  | "homeworkStatus"
  | "includeEnded"
  | "includeClosed"
  | "sort";

export type ReportDefinition = {
  key: ReportKey;
  code: string;
  title: string;
  purpose: string;
  group: ReportGroup;
  roles: readonly ReportRole[];
  filters: readonly ReportFilter[];
  /** Filters only staff see; families never pick another Student. */
  staffOnlyFilters?: readonly ReportFilter[];
  /** Sort choices, the first is the default. */
  sorts?: readonly { value: string; label: string }[];
  /** Period preset used when none is given. */
  defaultPeriod: "this_month" | "last_7_days" | "enrollment" | "none";
  excel: readonly ReportRole[];
  pdf: readonly ReportRole[];
  /** Prints on A4 landscape. */
  landscape?: boolean;
  /** The Owner may email it to linked parents (R11, R18). */
  emailToParents?: boolean;
};

const STAFF = ["owner", "teacher"] as const;
const OWNER = ["owner"] as const;
const EVERYONE = ["owner", "teacher", "student", "parent"] as const;
const FAMILY = ["student", "parent"] as const;

export const REPORT_CATALOGUE: readonly ReportDefinition[] = [
  {
    key: "student-attendance",
    code: "R1",
    title: "Student attendance",
    purpose:
      "One Student's attendance over a period, for a PTM, a parent's question or a certificate.",
    group: "attendance",
    roles: EVERYONE,
    filters: ["student", "period", "enrollment"],
    staffOnlyFilters: ["student"],
    defaultPeriod: "this_month",
    excel: STAFF,
    pdf: EVERYONE,
  },
  {
    key: "attendance-register",
    code: "R2",
    title: "Batch attendance register",
    purpose:
      "The monthly register for a Batch: every Student against every Class date.",
    group: "attendance",
    roles: STAFF,
    filters: ["batch", "period", "includeEnded", "sort"],
    sorts: [
      { value: "name", label: "Students A–Z" },
      { value: "percent", label: "Attendance %" },
    ],
    defaultPeriod: "this_month",
    excel: STAFF,
    pdf: [],
    landscape: true,
  },
  {
    key: "low-attendance",
    code: "R3",
    title: "Low attendance",
    purpose:
      "Students below the attendance threshold, or absent several Classes in a row.",
    group: "attendance",
    roles: STAFF,
    filters: ["period", "course", "batch", "classMode", "includeEnded"],
    defaultPeriod: "this_month",
    excel: STAFF,
    pdf: [],
  },
  {
    key: "absence-notices",
    code: "R4",
    title: "Absence notices",
    purpose:
      "How many absences were notified in advance, and who stays away without telling anyone.",
    group: "attendance",
    roles: STAFF,
    filters: ["period", "course", "batch", "reason", "givenBy"],
    defaultPeriod: "this_month",
    excel: STAFF,
    pdf: [],
  },
  {
    key: "pending-attendance",
    code: "R5",
    title: "Pending attendance",
    purpose: "Past Classes whose register hasn't been marked yet.",
    group: "attendance",
    roles: STAFF,
    filters: ["period", "teacher", "batch"],
    staffOnlyFilters: [],
    defaultPeriod: "last_7_days",
    excel: STAFF,
    pdf: [],
  },
  {
    key: "teacher-classes",
    code: "R6",
    title: "Teacher classes",
    purpose:
      "Classes each Teacher was scheduled, conducted and recorded on time, and hours taught.",
    group: "teaching",
    roles: STAFF,
    filters: ["teacher", "period", "batch", "classMode"],
    defaultPeriod: "this_month",
    excel: STAFF,
    pdf: [],
  },
  {
    key: "batch-strength",
    code: "R7",
    title: "Batch strength and utilisation",
    purpose:
      "Seats taken and free in each Batch, joiners and leavers, and the attendance trend.",
    group: "batches",
    roles: STAFF,
    filters: [
      "period",
      "course",
      "batch",
      "classMode",
      "includeClosed",
      "sort",
    ],
    sorts: [
      { value: "utilisation", label: "Utilisation, lowest first" },
      { value: "course", label: "Course, then Batch" },
    ],
    defaultPeriod: "this_month",
    excel: STAFF,
    pdf: [],
  },
  {
    key: "collections",
    code: "R8",
    title: "Collections",
    purpose:
      "Fees collected by method, Course, Batch, month and day, with demo fees apart.",
    group: "fees",
    roles: OWNER,
    filters: ["period", "method", "course", "batch", "recordedBy"],
    defaultPeriod: "this_month",
    excel: OWNER,
    pdf: [],
  },
  {
    key: "dues",
    code: "R9",
    title: "Outstanding and overdue dues",
    purpose: "Who owes what, how overdue it is, and the last follow-up.",
    group: "fees",
    roles: OWNER,
    filters: ["dueFilter", "ageGroup", "course", "batch", "includeEnded"],
    defaultPeriod: "none",
    excel: OWNER,
    pdf: [],
  },
  {
    key: "receipts",
    code: "R10",
    title: "Receipts register",
    purpose: "Every Receipt issued in the period, for the CA or an audit.",
    group: "fees",
    roles: OWNER,
    filters: ["period", "method", "course", "batch", "recordedBy"],
    defaultPeriod: "this_month",
    excel: OWNER,
    pdf: [],
  },
  {
    key: "fee-statement",
    code: "R11",
    title: "Student fee statement",
    purpose: "What was charged, what was paid, and what is left.",
    group: "fees",
    roles: ["owner", "student", "parent"],
    filters: ["student", "enrollment", "period"],
    staffOnlyFilters: ["student"],
    defaultPeriod: "enrollment",
    excel: [],
    pdf: ["owner", "student", "parent"],
    emailToParents: true,
  },
  {
    key: "enquiry-funnel",
    code: "R12",
    title: "Enquiry and admissions funnel",
    purpose:
      "Where admissions come from and where Enquiries drop off, month by month.",
    group: "enquiries",
    roles: OWNER,
    filters: ["period", "source", "course", "addedBy", "classMode"],
    defaultPeriod: "this_month",
    excel: OWNER,
    pdf: [],
  },
  {
    key: "demo-classes",
    code: "R13",
    title: "Demo classes",
    purpose: "Demos booked and attended, and how they lead to admissions.",
    group: "enquiries",
    roles: STAFF,
    filters: ["period", "teacher", "demoKind", "demoFee", "demoAttendance"],
    defaultPeriod: "this_month",
    excel: STAFF,
    pdf: [],
  },
  {
    key: "online-classes",
    code: "R14",
    title: "Online classes",
    purpose:
      "Whether Online and Hybrid Classes happen, Students join, and recordings exist.",
    group: "online",
    roles: EVERYONE,
    filters: ["student", "period", "batch", "teacher", "meeting"],
    staffOnlyFilters: ["batch", "teacher", "meeting"],
    defaultPeriod: "this_month",
    excel: STAFF,
    pdf: FAMILY,
  },
  {
    key: "test-results",
    code: "R15",
    title: "Student test results",
    purpose: "One Student's published Test results, for PTMs and progress.",
    group: "tests",
    roles: EVERYONE,
    filters: ["student", "period", "course", "batch"],
    staffOnlyFilters: ["student"],
    defaultPeriod: "this_month",
    excel: STAFF,
    pdf: EVERYONE,
  },
  {
    key: "batch-tests",
    code: "R16",
    title: "Batch test performance",
    purpose: "Spot Students falling behind in a Batch's Tests.",
    group: "tests",
    roles: STAFF,
    filters: ["batch", "period"],
    defaultPeriod: "this_month",
    excel: STAFF,
    pdf: [],
    landscape: true,
  },
  {
    key: "homework",
    code: "R17",
    title: "Homework",
    purpose: "Whether Homework is being set, submitted and checked.",
    group: "homework",
    roles: EVERYONE,
    filters: ["student", "batch", "period", "homeworkStatus"],
    staffOnlyFilters: [],
    defaultPeriod: "this_month",
    excel: STAFF,
    pdf: FAMILY,
  },
  {
    key: "monthly-student",
    code: "R18",
    title: "Monthly student report",
    purpose:
      "One monthly sheet per Student for the PTM or to keep at home, with remarks.",
    group: "combined",
    roles: EVERYONE,
    filters: ["student", "batch", "month"],
    staffOnlyFilters: ["batch"],
    defaultPeriod: "this_month",
    excel: [],
    pdf: EVERYONE,
    emailToParents: true,
  },
  {
    key: "monthly-review",
    code: "R19",
    title: "Owner monthly review",
    purpose: "This month against last month, on one page.",
    group: "combined",
    roles: OWNER,
    filters: ["month"],
    defaultPeriod: "this_month",
    excel: OWNER,
    pdf: OWNER,
  },
];

export function reportDefinition(key: ReportKey): ReportDefinition {
  const definition = REPORT_CATALOGUE.find((item) => item.key === key);
  if (definition == null) throw new Error(`Unknown report ${key}`);
  return definition;
}

export function isReportKey(value: string): value is ReportKey {
  return (REPORT_KEYS as readonly string[]).includes(value);
}

export function reportsForRole(role: ReportRole): ReportDefinition[] {
  return REPORT_CATALOGUE.filter((item) => item.roles.includes(role));
}

/** The filters a role picks on screen. */
export function filtersForRole(
  definition: ReportDefinition,
  role: ReportRole,
): ReportFilter[] {
  const staff = role === "owner" || role === "teacher";
  return definition.filters.filter(
    (filter) =>
      // A Teacher only ever sees their own numbers.
      (filter !== "teacher" || role === "owner") &&
      (staff ||
        !(definition.staffOnlyFilters ?? []).includes(filter) ||
        // A Parent with several children picks one; a Student is always self.
        (filter === "student" && role === "parent")),
  );
}

export type ReportFormat = "xlsx" | "pdf";

export function canDownload(
  definition: ReportDefinition,
  role: ReportRole,
  format: ReportFormat,
): boolean {
  return (format === "xlsx" ? definition.excel : definition.pdf).includes(role);
}

export const DEMO_KIND_LABELS = {
  batch: "In a Batch class",
  one_to_one: "One-to-one",
} as const;

export const PAYMENT_METHOD_LABELS = {
  cash: "Cash",
  upi: "UPI",
  card: "Card",
  other: "Other",
} as const;

export const CLASS_MODE_LABELS = {
  offline: "Offline",
  online: "Online",
  hybrid: "Hybrid",
} as const;

export const DUES_AGE_GROUPS = [
  "due_soon",
  "not_yet_due",
  "1_15",
  "16_30",
  "31_60",
  "over_60",
] as const;

export type DuesAgeGroup = (typeof DUES_AGE_GROUPS)[number];

export const DUES_AGE_GROUP_LABELS: Record<DuesAgeGroup, string> = {
  due_soon: "Due soon",
  not_yet_due: "Not yet due",
  "1_15": "1–15 days overdue",
  "16_30": "16–30 days overdue",
  "31_60": "31–60 days overdue",
  over_60: "Over 60 days overdue",
};

export const HOMEWORK_REPORT_STATUSES = [
  "submitted",
  "late",
  "not_submitted",
  "overdue",
  "checked",
  "not_checked",
] as const;

export type HomeworkReportStatus = (typeof HOMEWORK_REPORT_STATUSES)[number];

export const HOMEWORK_REPORT_STATUS_LABELS: Record<
  HomeworkReportStatus,
  string
> = {
  submitted: "Submitted on time",
  late: "Submitted late",
  not_submitted: "Not submitted",
  overdue: "Overdue",
  checked: "Checked",
  not_checked: "Not yet checked",
};
