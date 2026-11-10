// Storybook fixtures for the Reports screens. Never imported by the app.

import type {
  ReportCatalogueItem,
  ReportCatalogueResponse,
  ReportDocumentResponse,
  ReportOptionsResponse,
  ReportRow,
  ReportSettingsResponse,
} from "@/src/queries/reports";
import {
  canDownload,
  filtersForRole,
  reportDefinition,
  reportsForRole,
  type ReportKey,
  type ReportRole,
} from "@/src/training-institute/domain/report-catalogue";

export const ANITA = "880e8400-e29b-41d4-a716-446655440001";
export const RAHUL = "880e8400-e29b-41d4-a716-446655440002";
export const PRIYA = "880e8400-e29b-41d4-a716-446655440003";
export const DCA_MORNING = "660e8400-e29b-41d4-a716-446655440001";
export const TALLY_EVENING = "660e8400-e29b-41d4-a716-446655440002";
export const ANITA_DCA = "990e8400-e29b-41d4-a716-446655440001";
export const ANITA_TALLY = "990e8400-e29b-41d4-a716-446655440002";

/** What GET /reports answers for `role`, straight from the Reports catalogue. */
export function catalogueItem(
  key: ReportKey,
  role: ReportRole,
): ReportCatalogueItem {
  const definition = reportDefinition(key);
  return {
    key: definition.key,
    code: definition.code,
    title: definition.title,
    purpose: definition.purpose,
    group: definition.group,
    filters: filtersForRole(definition, role),
    sorts: [...(definition.sorts ?? [])],
    defaultPeriod: definition.defaultPeriod,
    excel: canDownload(definition, role, "xlsx"),
    pdf: canDownload(definition, role, "pdf"),
    emailToParents: definition.emailToParents === true,
    landscape: definition.landscape === true,
  };
}

export function catalogueFor(role: ReportRole): ReportCatalogueResponse {
  return {
    role,
    items: reportsForRole(role).map((definition) =>
      catalogueItem(definition.key, role),
    ),
  };
}

export const reportOptions: ReportOptionsResponse = {
  role: "owner",
  students: [
    { value: ANITA, label: "Anita Sharma" },
    { value: PRIYA, label: "Priya Nair" },
    { value: RAHUL, label: "Rahul Verma" },
  ],
  enrollments: [
    { value: ANITA_DCA, label: "DCA · DCA Morning", studentId: ANITA },
    { value: ANITA_TALLY, label: "Tally · Tally Evening", studentId: ANITA },
    {
      value: "990e8400-e29b-41d4-a716-446655440003",
      label: "Tally · Tally Evening",
      studentId: PRIYA,
    },
  ],
  batches: [
    { value: DCA_MORNING, label: "DCA Morning" },
    { value: TALLY_EVENING, label: "Tally Evening" },
  ],
  courses: [
    { value: "770e8400-e29b-41d4-a716-446655440001", label: "DCA" },
    { value: "770e8400-e29b-41d4-a716-446655440002", label: "Tally" },
  ],
  teachers: [
    { value: "aa0e8400-e29b-41d4-a716-446655440001", label: "Meena Iyer" },
  ],
  sources: [
    { value: "bb0e8400-e29b-41d4-a716-446655440001", label: "Walk-in" },
    { value: "bb0e8400-e29b-41d4-a716-446655440002", label: "Instagram" },
  ],
  recorders: [{ value: "user_owner", label: "Arun" }],
  staff: [{ value: "user_owner", label: "Arun" }],
  today: "2026-10-13",
};

export const reportSettings: ReportSettingsResponse = {
  thresholdPercent: 75,
  absentInARow: 3,
  minimumClasses: 4,
  academicYearStartMonth: 6,
};

const base = {
  instituteName: "Riverside Computer Centre",
  generatedAt: "2026-10-13T05:10:00.000Z",
  generatedLabel: "13 Oct 2026, 10:40 AM",
  orientation: "portrait",
  emptyText: null,
} as const;

function row(
  cells: Record<string, string>,
  tones: Partial<Record<string, ReportRow["tone"]>> = {},
  tone: ReportRow["tone"] = null,
): ReportRow {
  return {
    tone,
    cells: Object.fromEntries(
      Object.entries(cells).map(([key, text]) => [
        key,
        { text, tone: tones[key] ?? null },
      ]),
    ),
  };
}

/** R1 for one Student: summary numbers and every Class in the period. */
export const studentAttendanceDocument: ReportDocumentResponse = {
  ...base,
  report: "student-attendance",
  code: "R1",
  title: "Student attendance",
  subject: "Anita Sharma",
  period: {
    from: "2026-10-01",
    to: "2026-10-31",
    label: "1 Oct 2026 – 31 Oct 2026",
  },
  filters: [
    { label: "Student", value: "Anita Sharma" },
    { label: "Enrollment", value: "DCA · DCA Morning" },
  ],
  pages: [
    {
      heading: null,
      sections: [
        {
          kind: "metrics",
          id: "summary",
          title: "Summary",
          description: "Counted Classes up to today.",
          items: [
            { label: "Classes held", value: "9" },
            { label: "Present", value: "6", tone: "good" },
            { label: "Late", value: "1", detail: "Counts as attended" },
            { label: "Informed absent", value: "1", tone: "warn" },
            { label: "Absent", value: "1", tone: "danger" },
            {
              label: "Attendance",
              value: "78%",
              detail: "Threshold 75%",
              tone: "good",
            },
          ],
        },
        {
          kind: "table",
          id: "classes",
          title: "Classes",
          columns: [
            { key: "date", label: "Date" },
            { key: "time", label: "Time" },
            { key: "batch", label: "Batch" },
            { key: "status", label: "Status" },
            { key: "note", label: "Note", tone: "muted" },
          ],
          rows: [
            row({
              date: "Thu 1 Oct",
              time: "9 AM – 11 AM",
              batch: "DCA Morning",
              status: "Present",
              note: "",
            }),
            row({
              date: "Sat 3 Oct",
              time: "9 AM – 11 AM",
              batch: "DCA Morning",
              status: "Present",
              note: "",
            }),
            row(
              {
                date: "Mon 5 Oct",
                time: "9 AM – 11 AM",
                batch: "DCA Morning",
                status: "Absent",
                note: "",
              },
              { status: "danger" },
            ),
            row(
              {
                date: "Tue 6 Oct",
                time: "9 AM – 11 AM",
                batch: "DCA Morning",
                status: "Informed absent",
                note: "Sick · notice by Parent",
              },
              { status: "warn" },
            ),
            row(
              {
                date: "Thu 8 Oct",
                time: "9 AM – 11 AM",
                batch: "DCA Morning",
                status: "Late",
                note: "Came at 9:20 AM",
              },
              {},
            ),
            row(
              {
                date: "Fri 9 Oct",
                time: "",
                batch: "DCA Morning",
                status: "Holiday",
                note: "Dussehra",
              },
              {},
              "shaded",
            ),
            row({
              date: "Sat 10 Oct",
              time: "9 AM – 11 AM",
              batch: "DCA Morning",
              status: "Present",
              note: "",
            }),
            row({
              date: "Mon 12 Oct",
              time: "9 AM – 11 AM",
              batch: "DCA Morning",
              status: "Present",
              note: "",
            }),
          ],
          totals: row({
            date: "Total",
            time: "",
            batch: "",
            status: "7 of 9 attended",
            note: "",
          }),
          emptyText: "No Classes in this period.",
        },
        {
          kind: "notes",
          id: "notes",
          title: "How this is counted",
          lines: [
            "Late counts as attended. Informed absent and Absent never do.",
            "Unmarked Classes are left out until their register is marked.",
          ],
        },
      ],
    },
  ],
};

const REGISTER_DAYS = [
  ["1", "Thu"],
  ["3", "Sat"],
  ["4", "Sun"],
  ["5", "Mon"],
  ["6", "Tue"],
  ["8", "Thu"],
  ["9", "Fri"],
  ["10", "Sat"],
  ["11", "Sun"],
  ["12", "Mon"],
  ["13", "Tue"],
  ["15", "Thu"],
  ["17", "Sat"],
  ["19", "Mon"],
  ["20", "Tue"],
  ["22", "Thu"],
  ["24", "Sat"],
] as const;

const SHADED_DAYS = new Set(["4", "9", "11"]);

function registerRow(name: string, marks: string, percent: string): ReportRow {
  const cells: ReportRow["cells"] = { student: { text: name } };
  REGISTER_DAYS.forEach(([day], index) => {
    const mark = SHADED_DAYS.has(day) ? "" : (marks[index] ?? "");
    cells[`d${day}`] = {
      text: mark === "." ? "" : mark,
      tone: mark === "A" ? "danger" : mark === "N" ? "warn" : null,
    };
  });
  cells["percent"] = {
    text: percent,
    tone: Number.parseInt(percent, 10) < 75 ? "danger" : null,
  };
  return { cells };
}

/** R2: a landscape monthly grid, names stuck to the left. */
export const registerDocument: ReportDocumentResponse = {
  ...base,
  orientation: "landscape",
  report: "attendance-register",
  code: "R2",
  title: "Batch attendance register",
  subject: "DCA Morning",
  period: { from: "2026-10-01", to: "2026-10-31", label: "October 2026" },
  filters: [
    { label: "Batch", value: "DCA Morning" },
    { label: "Ended Enrollments", value: "Hidden" },
    { label: "Sort", value: "Students A–Z" },
  ],
  pages: [
    {
      heading: null,
      sections: [
        {
          kind: "table",
          id: "register",
          title: "Register",
          description:
            "P Present · A Absent · N Informed absent · L Late · shaded: no Class",
          stickyFirstColumn: true,
          dense: true,
          columns: [
            { key: "student", label: "Student" },
            ...REGISTER_DAYS.map(([day, weekday]) => ({
              key: `d${day}`,
              label: day,
              detail: weekday,
              align: "center" as const,
              tone: SHADED_DAYS.has(day) ? ("shaded" as const) : null,
            })),
            { key: "percent", label: "%", align: "right" as const },
          ],
          rows: [
            registerRow("Anita Sharma", "PP.ANP.LP.PP.....", "78%"),
            registerRow("Deepak Kumar", "PP.PPP.PP.PPPPPP", "100%"),
            registerRow("Fatima Begum", "AP.AAP.PA.PNPAP", "50%"),
            registerRow("Karthik Subramanian", "PL.PPP.PP.PPAPPP", "93%"),
            registerRow("Priya Nair", "PP.PNP.PP.PPPPPP", "93%"),
            registerRow("Rahul Verma", "PA.PPA.PP.APPPPA", "71%"),
          ],
          totals: {
            cells: {
              student: { text: "Present" },
              ...Object.fromEntries(
                REGISTER_DAYS.map(([day]) => [
                  `d${day}`,
                  { text: SHADED_DAYS.has(day) ? "" : "5" },
                ]),
              ),
              percent: { text: "81%" },
            },
          },
          emptyText: "No Students in this Batch.",
        },
      ],
    },
  ],
};

/** R9 with nothing owed. */
export const emptyDocument: ReportDocumentResponse = {
  ...base,
  report: "dues",
  code: "R9",
  title: "Outstanding and overdue dues",
  subject: null,
  period: null,
  filters: [
    { label: "Ended Enrollments and dropped Students", value: "Included" },
  ],
  emptyText:
    "No dues. Every Enrollment has paid what its Fee Plan asks for so far.",
  pages: [],
};

/** R18 for a whole Batch: one sheet per Student. */
export const monthlyBatchDocument: ReportDocumentResponse = {
  ...base,
  report: "monthly-student",
  code: "R18",
  title: "Monthly student report",
  subject: "Tally Evening",
  period: { from: "2026-10-01", to: "2026-10-31", label: "October 2026" },
  filters: [{ label: "Batch", value: "Tally Evening" }],
  pages: ["Anita Sharma", "Priya Nair"].map((name) => ({
    heading: name,
    sections: [
      {
        kind: "metrics" as const,
        id: `${name}-summary`,
        title: "This month",
        items: [
          { label: "Attendance", value: "88%", tone: "good" as const },
          { label: "Tests", value: "2 published" },
          { label: "Homework", value: "4 of 5 submitted" },
          { label: "Fees remaining", value: "₹2,000", tone: "warn" as const },
        ],
      },
      {
        kind: "notes" as const,
        id: `${name}-remarks`,
        title: "Remarks",
        lines: ["Arun (Owner): Good progress in Tally; practise GST entries."],
      },
    ],
  })),
};

/** R19: metrics that open the report behind them. */
export const monthlyReviewDocument: ReportDocumentResponse = {
  ...base,
  report: "monthly-review",
  code: "R19",
  title: "Owner monthly review",
  subject: null,
  period: { from: "2026-10-01", to: "2026-10-31", label: "October 2026" },
  filters: [],
  pages: [
    {
      heading: null,
      sections: [
        {
          kind: "metrics",
          id: "money",
          title: "Money",
          items: [
            {
              label: "Collected",
              value: "₹1,25,000",
              detail: "September: ₹1,10,500",
              tone: "good",
              link: {
                report: "collections",
                query: { period: "this_month" },
              },
            },
            {
              label: "Overdue",
              value: "₹18,500",
              detail: "6 Enrollments",
              tone: "danger",
              link: { report: "dues", query: { dueFilter: "overdue" } },
            },
          ],
        },
      ],
    },
  ],
};
