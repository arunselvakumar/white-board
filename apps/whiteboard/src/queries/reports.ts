import { queryOptions } from "@tanstack/react-query";

import type {
  ReportFilter,
  ReportKey,
  ReportRole,
} from "@/src/training-institute/domain/report-catalogue";

import { apiJson, QueryHttpError } from "./http";

const BASE = "/api/training-institute/reports";
const jsonHeaders = { "content-type": "application/json" };

// Client shapes of app/api/training-institute/reports/report-models.ts.

export type ReportCatalogueItem = {
  key: ReportKey;
  code: string;
  title: string;
  purpose: string;
  group: string;
  /** The filters this role picks on screen. */
  filters: ReportFilter[];
  /** Sort choices; the first is the default. */
  sorts: { value: string; label: string }[];
  defaultPeriod: "this_month" | "last_7_days" | "enrollment" | "none";
  excel: boolean;
  pdf: boolean;
  emailToParents: boolean;
  landscape: boolean;
};

export type ReportCatalogueResponse = {
  role: ReportRole;
  items: ReportCatalogueItem[];
};

export type ReportOption = { value: string; label: string };

export type ReportOptionsResponse = {
  role: ReportRole;
  students: ReportOption[];
  enrollments: (ReportOption & { studentId: string })[];
  batches: ReportOption[];
  courses: ReportOption[];
  teachers: ReportOption[];
  sources: ReportOption[];
  recorders: ReportOption[];
  staff: ReportOption[];
  /** YYYY-MM-DD in the institute's time zone. */
  today: string;
};

export type ReportTone = "muted" | "good" | "warn" | "danger" | "shaded";

export type ReportCell = {
  /** Preformatted by the server: show as-is. */
  text: string;
  value?: number | null;
  tone?: ReportTone | null;
};

export type ReportRow = {
  cells: Record<string, ReportCell>;
  tone?: ReportTone | null;
};

export type ReportColumn = {
  key: string;
  label: string;
  align?: "left" | "right" | "center";
  tone?: ReportTone | null;
  /** A second, muted line under the label. */
  detail?: string | null;
};

export type ReportTableSection = {
  kind: "table";
  id: string;
  title: string;
  description?: string | null;
  columns: ReportColumn[];
  rows: ReportRow[];
  totals?: ReportRow | null;
  emptyText: string;
  stickyFirstColumn?: boolean;
  dense?: boolean;
};

export type ReportMetricLink = {
  report: ReportKey;
  query: Record<string, string>;
};

export type ReportMetric = {
  label: string;
  value: string;
  detail?: string | null;
  tone?: ReportTone | null;
  link?: ReportMetricLink | null;
};

export type ReportMetricsSection = {
  kind: "metrics";
  id: string;
  title: string;
  description?: string | null;
  items: ReportMetric[];
};

export type ReportNotesSection = {
  kind: "notes";
  id: string;
  title: string;
  lines: string[];
};

export type ReportSection =
  ReportTableSection | ReportMetricsSection | ReportNotesSection;

export type ReportDocumentResponse = {
  report: ReportKey;
  code: string;
  title: string;
  instituteName: string;
  subject: string | null;
  period: { from: string; to: string; label: string } | null;
  generatedAt: string;
  generatedLabel: string;
  filters: { label: string; value: string }[];
  orientation: "portrait" | "landscape";
  emptyText: string | null;
  pages: { heading: string | null; sections: ReportSection[] }[];
};

export type ReportSettingsResponse = {
  thresholdPercent: number;
  absentInARow: number;
  minimumClasses: number;
  /** 1–12. */
  academicYearStartMonth: number;
};

export type ReportEmailResponse = {
  sent: { studentName: string; email: string }[];
  notSent: { studentName: string; reason: string }[];
};

/** Every parameter a report URL may carry. */
export const REPORT_PARAM_NAMES = [
  "period",
  "from",
  "to",
  "month",
  "studentId",
  "enrollmentId",
  "batchId",
  "courseId",
  "teacherId",
  "classMode",
  "method",
  "recordedBy",
  "sourceId",
  "addedBy",
  "reason",
  "givenBy",
  "demoKind",
  "demoFee",
  "demoAttendance",
  "meeting",
  "dueFilter",
  "ageGroup",
  "homeworkStatus",
  "includeEnded",
  "includeClosed",
  "sort",
] as const;

export type ReportParamName = (typeof REPORT_PARAM_NAMES)[number];

/** Query-string parameters, as strings; a missing key is the server default. */
export type ReportParams = Partial<Record<ReportParamName, string>>;

type QueryValues = Readonly<Record<string, string | undefined>>;

/** `a=1&b=2` with keys in a stable order, so equal params share a cache entry. */
export function reportQueryString(params: QueryValues): string {
  const search = new URLSearchParams();
  for (const key of Object.keys(params).sort()) {
    const value = params[key];
    if (value != null && value !== "") search.set(key, value);
  }
  return search.toString();
}

export function reportHref(key: ReportKey, params: QueryValues = {}): string {
  const query = reportQueryString(params);
  return query === "" ? `/reports/${key}` : `/reports/${key}?${query}`;
}

export function reportDownloadHref(
  key: ReportKey,
  format: "xlsx" | "pdf",
  params: ReportParams,
): string {
  return `${BASE}/${key}/download?${reportQueryString({ ...params, format })}`;
}

export const reportQueries = {
  key: {
    all: ["reports"] as const,
    catalogue: () => [...reportQueries.key.all, "catalogue"] as const,
    options: () => [...reportQueries.key.all, "options"] as const,
    documents: () => [...reportQueries.key.all, "document"] as const,
    document: (key: ReportKey, params: ReportParams) =>
      [
        ...reportQueries.key.documents(),
        key,
        reportQueryString(params),
      ] as const,
    settings: () => [...reportQueries.key.all, "settings"] as const,
  },
  catalogue: () =>
    queryOptions({
      queryKey: reportQueries.key.catalogue(),
      queryFn: () => apiJson<ReportCatalogueResponse>(BASE),
    }),
  options: () =>
    queryOptions({
      queryKey: reportQueries.key.options(),
      queryFn: () => apiJson<ReportOptionsResponse>(`${BASE}/options`),
    }),
  document: (key: ReportKey, params: ReportParams) =>
    queryOptions({
      queryKey: reportQueries.key.document(key, params),
      queryFn: () => {
        const query = reportQueryString(params);
        return apiJson<ReportDocumentResponse>(
          query === "" ? `${BASE}/${key}` : `${BASE}/${key}?${query}`,
        );
      },
      // A report the filters can't build (400, 404) won't build on a retry.
      retry: (count, error) =>
        !(error instanceof QueryHttpError && error.status < 500) && count < 3,
    }),
  settings: () =>
    queryOptions({
      queryKey: reportQueries.key.settings(),
      queryFn: () => apiJson<ReportSettingsResponse>(`${BASE}/settings`),
    }),
};

function post<T>(path: string, body: unknown): Promise<T> {
  return apiJson<T>(`${BASE}${path}`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(body),
  });
}

/** Owner only. Changes apply to every report straight away. */
export function updateReportSettings(
  input: ReportSettingsResponse,
): Promise<ReportSettingsResponse> {
  return post("/settings/update", input);
}

/** The viewer's one remark on a Student's monthly report (R18). Blank removes it. */
export function saveReportRemark(input: {
  studentId: string;
  month: string;
  text: string;
}): Promise<void> {
  return post("/remarks", input);
}

/** Owner only, after confirming. */
export function emailReport(
  key: ReportKey,
  to: "parents" | "self",
  query: ReportParams,
): Promise<ReportEmailResponse> {
  return post(`/${key}/email`, { to, confirmed: true, query });
}
