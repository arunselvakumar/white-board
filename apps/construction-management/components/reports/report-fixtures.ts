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

// Site work reports (CM-605, CM-608).

export const CONTRACTOR_ID = "0190a000-0000-7000-8000-0000000000c1";
export const EQUIPMENT_ID = "0190a000-0000-7000-8000-0000000000e1";

/** The worksheet form options as the Daily Work card reads them (Contractors only). */
export const WORKSHEET_OPTIONS_PATH = `/api/construction/site-work/worksheets/form-options?projectId=${PROJECT_ID}`;
export const WORKSHEET_OPTIONS = {
  contractors: [
    { id: CONTRACTOR_ID, name: "Velan Constructions", departments: [] },
  ],
};

/** The equipment at the Project, as the usage cards read it. */
export const PROJECT_EQUIPMENT_PATH = `/api/construction/site-work/equipment?limit=50&projectId=${PROJECT_ID}`;
export const PROJECT_EQUIPMENT = {
  items: [
    { id: EQUIPMENT_ID, name: "JCB 3DX", equipmentNumber: "TN-09-AB-1234" },
  ],
  nextCursor: null,
  total: 1,
};

export const DONE_DAILY_WORK = job({
  id: "0190a000-0000-7000-8000-0000000000b5",
  kind: "daily_work",
  title: "Daily Work",
  params: { from: "2026-10-01", to: "2026-10-09", contractorId: CONTRACTOR_ID },
});

export const DONE_RENTED_USAGE = job({
  id: "0190a000-0000-7000-8000-0000000000b6",
  kind: "rented_equipment_usage",
  title: "Rented Equipment Usage",
  params: { from: "2026-10-01", to: "2026-10-09", equipmentId: null },
  includesMoney: true,
});

export const CENTRAL_LIST_PATH = API;

export const CENTRAL_MAINTENANCE = job({
  id: "0190a000-0000-7000-8000-0000000000b7",
  kind: "equipment_maintenance",
  title: "Equipment Maintenance",
  projectId: null,
  params: { from: "2026-10-01", to: "2026-10-09" },
  includesMoney: true,
});

export const CENTRAL_TRANSFERS = job({
  id: "0190a000-0000-7000-8000-0000000000b8",
  kind: "equipment_transfers",
  title: "Equipment Transfers",
  projectId: null,
  params: { from: "2026-09-01", to: "2026-09-30" },
});

/** A central vendor report: not an equipment report, so the dialog leaves it out. */
export const CENTRAL_VENDOR = job({
  id: "0190a000-0000-7000-8000-0000000000b9",
  kind: "vendor_attendance",
  title: "Vendor Attendance",
  projectId: null,
});
