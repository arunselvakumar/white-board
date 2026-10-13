// How the Reports screen turns its filters into query-string parameters
// (app/api/training-institute/reports/report-models.ts). A parameter the
// viewer hasn't picked is left out, so the server applies its default.

import {
  REPORT_PARAM_NAMES,
  type ReportParamName,
  type ReportParams,
} from "@/src/queries/reports";
import { ABSENCE_REASON_LABELS } from "@/src/training-institute/domain/absence-notice";
import {
  CLASS_MODE_LABELS,
  DEMO_KIND_LABELS,
  DUES_AGE_GROUP_LABELS,
  HOMEWORK_REPORT_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  type ReportFilter,
  type ReportKey,
  type ReportRole,
} from "@/src/training-institute/domain/report-catalogue";

export const REPORT_FILTER_PARAMS: Record<ReportFilter, ReportParamName> = {
  period: "period",
  month: "month",
  student: "studentId",
  enrollment: "enrollmentId",
  batch: "batchId",
  course: "courseId",
  teacher: "teacherId",
  classMode: "classMode",
  method: "method",
  recordedBy: "recordedBy",
  source: "sourceId",
  addedBy: "addedBy",
  reason: "reason",
  givenBy: "givenBy",
  demoKind: "demoKind",
  demoFee: "demoFee",
  demoAttendance: "demoAttendance",
  meeting: "meeting",
  dueFilter: "dueFilter",
  ageGroup: "ageGroup",
  homeworkStatus: "homeworkStatus",
  includeEnded: "includeEnded",
  includeClosed: "includeClosed",
  sort: "sort",
};

/** The report parameters in a URL, ignoring anything else and blanks. */
export function reportParamsFromSearch(search: URLSearchParams): ReportParams {
  const params: ReportParams = {};
  for (const name of REPORT_PARAM_NAMES) {
    const value = search.get(name);
    if (value != null && value !== "") params[name] = value;
  }
  return params;
}

/** `params` with `name` set, or removed when `value` is null or blank. */
export function withReportParam(
  params: ReportParams,
  name: ReportParamName,
  value: string | null,
): ReportParams {
  const { [name]: _previous, ...rest } = params;
  return value == null || value === "" ? rest : { ...rest, [name]: value };
}

export const REPORT_FILTER_LABELS: Record<ReportFilter, string> = {
  period: "Period",
  month: "Month",
  student: "Student",
  enrollment: "Enrollment",
  batch: "Batch",
  course: "Course",
  teacher: "Teacher",
  classMode: "Class Mode",
  method: "Payment method",
  recordedBy: "Recorded by",
  source: "Enquiry source",
  addedBy: "Added by",
  reason: "Reason",
  givenBy: "Notice given by",
  demoKind: "Demo type",
  demoFee: "Demo fee",
  demoAttendance: "Demo attendance",
  meeting: "Meeting",
  dueFilter: "Dues",
  ageGroup: "How overdue",
  homeworkStatus: "Homework status",
  includeEnded: "Include ended Enrollments",
  includeClosed: "Include closed Batches",
  sort: "Sort by",
};

type Items = { value: string; label: string }[];

function items(labels: Record<string, string>): Items {
  return Object.entries(labels).map(([value, label]) => ({ value, label }));
}

/** Choices for the filters whose values are fixed. */
export const REPORT_ENUM_FILTER_ITEMS: Partial<Record<ReportFilter, Items>> = {
  classMode: items(CLASS_MODE_LABELS),
  method: items(PAYMENT_METHOD_LABELS),
  reason: items(ABSENCE_REASON_LABELS),
  givenBy: [
    { value: "student", label: "Student" },
    { value: "parent", label: "Parent" },
  ],
  demoKind: items(DEMO_KIND_LABELS),
  demoFee: [
    { value: "free", label: "Free" },
    { value: "paid", label: "Paid" },
  ],
  demoAttendance: [
    { value: "attended", label: "Attended" },
    { value: "missed", label: "Missed" },
    { value: "upcoming", label: "Upcoming" },
  ],
  meeting: [
    { value: "whiteboard", label: "Hosted in Whiteboard" },
    { value: "external", label: "External link" },
  ],
  dueFilter: [
    { value: "all", label: "All with a balance" },
    { value: "overdue", label: "Overdue" },
    { value: "due_soon", label: "Due soon" },
  ],
  ageGroup: items(DUES_AGE_GROUP_LABELS),
  homeworkStatus: items(HOMEWORK_REPORT_STATUS_LABELS),
};

/** Who or what a report is about, when staff must pick it first. */
export type ReportSubjectNeed = "student" | "batch" | "studentOrBatch";

/**
 * What staff must pick before a report can be built (the server answers
 * REPORT_STUDENT_REQUIRED or REPORT_BATCH_REQUIRED without it). Families
 * always have a Student.
 */
export function missingReportSubject(
  key: ReportKey,
  role: ReportRole,
  params: ReportParams,
): ReportSubjectNeed | null {
  if (role !== "owner" && role !== "teacher") return null;
  const student = params.studentId != null;
  const batch = params.batchId != null;
  switch (key) {
    case "student-attendance":
    case "fee-statement":
    case "test-results":
      return student ? null : "student";
    case "attendance-register":
    case "batch-tests":
      return batch ? null : "batch";
    case "monthly-student":
      return student || batch ? null : "studentOrBatch";
    default:
      return null;
  }
}

/** A custom period needs both dates before the report can be built. */
export function missingCustomDates(params: ReportParams): boolean {
  return (
    params.period === "custom" && (params.from == null || params.to == null)
  );
}
