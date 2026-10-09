import type { ReportJob } from "@/src/queries/reports";

export const PROJECT_ID = "0190a000-0000-7000-8000-0000000000a1";
export const TODAY = "2026-10-09";

const API = "/api/construction/reporting/reports";

export const LIST_PATH = `${API}?projectId=${PROJECT_ID}`;

export function job(overrides: Partial<ReportJob> & { id: string }): ReportJob {
  const done = (overrides.status ?? "done") === "done";
  return {
    kind: "labour_attendance",
    title: "All Labour Attendance",
    projectId: PROJECT_ID,
    params: { from: "2026-10-01", to: "2026-10-09" },
    status: "done",
    includesMoney: false,
    error: null,
    requestedBy: "user-1",
    createdAt: "2026-10-09T05:30:00.000Z",
    startedAt: "2026-10-09T05:30:00.100Z",
    finishedAt: "2026-10-09T05:30:01.000Z",
    downloads: done
      ? {
          xlsx: `${API}/${overrides.id}/download?format=xlsx`,
          pdf: `${API}/${overrides.id}/download?format=pdf`,
        }
      : { xlsx: null, pdf: null },
    ...overrides,
  };
}

export const DONE_MUSTER = job({
  id: "0190a000-0000-7000-8000-0000000000b1",
  kind: "muster_roll",
  title: "Muster roll and wage register",
  params: { month: "2026-09" },
  includesMoney: true,
});

export const FAILED_PAYMENT = job({
  id: "0190a000-0000-7000-8000-0000000000b2",
  kind: "labour_payment",
  title: "All Labour Payment",
  status: "failed",
  error:
    "The report could not be generated. Try again; if it keeps failing, contact support.",
  includesMoney: true,
});

export const RUNNING_VENDOR = job({
  id: "0190a000-0000-7000-8000-0000000000b3",
  kind: "vendor_attendance",
  title: "Vendor Attendance",
  status: "running",
  finishedAt: null,
});

export const NEW_ATTENDANCE = job({
  id: "0190a000-0000-7000-8000-0000000000b4",
  params: { from: "2026-10-01", to: "2026-10-09" },
});
