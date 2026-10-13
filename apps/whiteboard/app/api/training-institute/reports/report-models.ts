import { z } from "zod";

import {
  DUES_AGE_GROUPS,
  HOMEWORK_REPORT_STATUSES,
  REPORT_KEYS,
} from "@/src/training-institute/domain/report-catalogue";
import type { ReportQuery } from "@/src/training-institute/application/report-context";
import { REPORT_PERIOD_PRESETS } from "@/src/training-institute/domain/report-period";

const Flag = z.enum(["true", "false"]).optional();

export const TrainingInstituteReportParamsModel = z.object({
  report: z.enum(REPORT_KEYS),
});

/** Every filter a report may take; each report reads the ones it lists. */
export const TrainingInstituteReportQueryModel = z.object({
  period: z.enum(REPORT_PERIOD_PRESETS).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),
  studentId: z.uuid().optional(),
  enrollmentId: z.uuid().optional(),
  batchId: z.uuid().optional(),
  courseId: z.uuid().optional(),
  teacherId: z.uuid().optional(),
  classMode: z.enum(["offline", "online", "hybrid"]).optional(),
  method: z.enum(["cash", "upi", "card", "other"]).optional(),
  recordedBy: z.string().min(1).max(200).optional(),
  sourceId: z.uuid().optional(),
  addedBy: z.string().min(1).max(200).optional(),
  reason: z.enum(["sick", "exam", "travel", "family", "other"]).optional(),
  givenBy: z.enum(["student", "parent"]).optional(),
  demoKind: z.enum(["batch", "one_to_one"]).optional(),
  demoFee: z.enum(["free", "paid"]).optional(),
  demoAttendance: z.enum(["attended", "missed", "upcoming"]).optional(),
  meeting: z.enum(["whiteboard", "external"]).optional(),
  dueFilter: z.enum(["due_soon", "overdue", "all"]).optional(),
  ageGroup: z.enum(DUES_AGE_GROUPS).optional(),
  homeworkStatus: z.enum(HOMEWORK_REPORT_STATUSES).optional(),
  includeEnded: Flag,
  includeClosed: Flag,
  sort: z.string().min(1).max(40).optional(),
});

export const DownloadTrainingInstituteReportRequestModel =
  TrainingInstituteReportQueryModel.extend({
    format: z.enum(["xlsx", "pdf"]),
  });

type ParsedQuery = z.infer<typeof TrainingInstituteReportQueryModel>;

/** The parsed query with its "true"/"false" flags as booleans. */
export function reportQuery(query: ParsedQuery): ReportQuery {
  const flag = (value: "true" | "false" | undefined) =>
    value == null ? null : value === "true";
  return {
    ...query,
    includeEnded: flag(query.includeEnded),
    includeClosed: flag(query.includeClosed),
  };
}

/** The query string as a plain object, for the models above. */
export function searchParamsObject(url: URL): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of url.searchParams)
    if (value !== "") result[key] = value;
  return result;
}

const Tone = z
  .enum(["muted", "good", "warn", "danger", "shaded"])
  .nullable()
  .optional();

const Cell = z.object({
  text: z.string(),
  value: z.number().nullable().optional(),
  tone: Tone,
});

const Row = z.object({ cells: z.record(z.string(), Cell), tone: Tone });

const Link = z.object({
  report: z.enum(REPORT_KEYS),
  query: z.record(z.string(), z.string()),
});

const Section = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("table"),
    id: z.string(),
    title: z.string(),
    description: z.string().nullable().optional(),
    columns: z.array(
      z.object({
        key: z.string(),
        label: z.string(),
        align: z.enum(["left", "right", "center"]).optional(),
        tone: Tone,
        detail: z.string().nullable().optional(),
      }),
    ),
    rows: z.array(Row),
    totals: Row.nullable().optional(),
    emptyText: z.string(),
    stickyFirstColumn: z.boolean().optional(),
    dense: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal("metrics"),
    id: z.string(),
    title: z.string(),
    description: z.string().nullable().optional(),
    items: z.array(
      z.object({
        label: z.string(),
        value: z.string(),
        detail: z.string().nullable().optional(),
        tone: Tone,
        link: Link.nullable().optional(),
      }),
    ),
  }),
  z.object({
    kind: z.literal("notes"),
    id: z.string(),
    title: z.string(),
    lines: z.array(z.string()),
  }),
]);

/** A report ready to show; print, Excel, PDF and email render the same. */
export const TrainingInstituteReportDocumentModel = z.object({
  report: z.enum(REPORT_KEYS),
  code: z.string(),
  title: z.string(),
  instituteName: z.string(),
  subject: z.string().nullable(),
  period: z
    .object({ from: z.iso.date(), to: z.iso.date(), label: z.string() })
    .nullable(),
  generatedAt: z.iso.datetime(),
  generatedLabel: z.string(),
  filters: z.array(z.object({ label: z.string(), value: z.string() })),
  orientation: z.enum(["portrait", "landscape"]),
  emptyText: z.string().nullable(),
  pages: z.array(
    z.object({ heading: z.string().nullable(), sections: z.array(Section) }),
  ),
});

export const TrainingInstituteReportCatalogueResponseModel = z.object({
  role: z.enum(["owner", "teacher", "student", "parent"]),
  items: z.array(
    z.object({
      key: z.enum(REPORT_KEYS),
      code: z.string(),
      title: z.string(),
      purpose: z.string(),
      group: z.string(),
      filters: z.array(z.string()),
      sorts: z.array(z.object({ value: z.string(), label: z.string() })),
      defaultPeriod: z.enum([
        "this_month",
        "last_7_days",
        "enrollment",
        "none",
      ]),
      excel: z.boolean(),
      pdf: z.boolean(),
      emailToParents: z.boolean(),
      landscape: z.boolean(),
    }),
  ),
});

const Option = z.object({ value: z.string(), label: z.string() });

export const TrainingInstituteReportOptionsResponseModel = z.object({
  role: z.enum(["owner", "teacher", "student", "parent"]),
  students: z.array(Option),
  enrollments: z.array(Option.extend({ studentId: z.uuid() })),
  batches: z.array(Option),
  courses: z.array(Option),
  teachers: z.array(Option),
  sources: z.array(Option),
  recorders: z.array(Option),
  staff: z.array(Option),
  today: z.iso.date(),
});

export const TrainingInstituteReportSettingsModel = z.object({
  thresholdPercent: z.number().int().min(1).max(100),
  absentInARow: z.number().int().min(2).max(30),
  minimumClasses: z.number().int().min(1).max(60),
  academicYearStartMonth: z.number().int().min(1).max(12),
});

export const UpdateTrainingInstituteReportSettingsRequestModel =
  TrainingInstituteReportSettingsModel;

export const SaveTrainingInstituteReportRemarkRequestModel = z.object({
  studentId: z.uuid(),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  /** Blank removes the remark. */
  text: z.string().max(300),
});

export const EmailTrainingInstituteReportRequestModel = z.object({
  /** Parents: R11 or R18 to linked parents. Self: the Owner's own account email. */
  to: z.enum(["parents", "self"]),
  /** The Owner pressed send and confirmed. */
  confirmed: z.literal(true),
  query: TrainingInstituteReportQueryModel.default({}),
});

export const TrainingInstituteReportEmailResponseModel = z.object({
  sent: z.array(z.object({ studentName: z.string(), email: z.string() })),
  notSent: z.array(z.object({ studentName: z.string(), reason: z.string() })),
});
