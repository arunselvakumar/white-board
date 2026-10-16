import type { ReportCatalogueEntry } from "@/src/queries/report-catalogue";
import type { ReportJob, ReportKind } from "@/src/queries/reports";
import {
  entriesIn,
  type ReportScope,
} from "@/src/reporting/domain/report-catalogue";

import type { ApiCall } from "../../.storybook/mocks/api";

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

// The report catalogue (CM-901): built from the server's own catalogue, so
// stories show the same cards, wording and filters as the app.

export const CATALOGUE_API = "/api/construction/reporting/catalogue";
export const PROJECT_CATALOGUE_PATH = `${CATALOGUE_API}?scope=project&projectId=${PROJECT_ID}`;
export const CENTRAL_CATALOGUE_PATH = `${CATALOGUE_API}?scope=central`;

/** The labour and site-work cards, which most stories show. */
export const LABOUR_AND_SITE_WORK_KINDS: readonly ReportKind[] = [
  "labour_attendance",
  "labour_payment",
  "labour_month",
  "vendor_attendance",
  "muster_roll",
  "daily_work",
  "owned_equipment_usage",
  "rented_equipment_usage",
  "equipment_maintenance",
  "equipment_transfers",
];

/**
 * Catalogue entries of `scope` as the route sends them: every built kind,
 * or only `kinds`; `includesMoney` as for a viewer with every money right.
 */
export function catalogueItems(
  scope: ReportScope,
  kinds?: readonly ReportKind[],
): ReportCatalogueEntry[] {
  return entriesIn(scope)
    .filter(
      (entry) =>
        entry.available && (kinds == null || kinds.includes(entry.kind)),
    )
    .map((entry) => ({
      kind: entry.kind,
      title: entry.title,
      description: entry.description,
      needs: entry.needs,
      group: entry.group,
      period: entry.period,
      formats: [...entry.formats],
      filters: entry.filters.map((filter) => ({
        key: filter.key,
        required: filter.required === true,
      })),
      money: entry.money,
      includesMoney: entry.money !== "never",
      progressReport: entry.progressReport,
    }));
}

/** Answers the catalogue reads: the Project's and the central one. */
export function catalogueHandler(
  kinds: {
    project?: readonly ReportKind[];
    central?: readonly ReportKind[];
  } = {},
): (call: ApiCall) => Response | undefined {
  return (call) => {
    if (call.method !== "GET") return undefined;
    if (call.path === PROJECT_CATALOGUE_PATH)
      return Response.json({
        scope: "project",
        items: catalogueItems("project", kinds.project),
      });
    if (call.path === CENTRAL_CATALOGUE_PATH)
      return Response.json({
        scope: "central",
        items: catalogueItems("central", kinds.central),
      });
    return undefined;
  };
}

// Central Reports and the cards' pickers (CM-903).

export const FILTER_OPTIONS_API = "/api/construction/reporting/filter-options";
export const PROJECT_FILTER_OPTIONS_PATH = `${FILTER_OPTIONS_API}?scope=project&projectId=${PROJECT_ID}`;
export const CENTRAL_FILTER_OPTIONS_PATH = `${FILTER_OPTIONS_API}?scope=central`;

export const TOWER_ID = PROJECT_ID;
export const VILLA_ID = "0190a000-0000-7000-8000-0000000000a2";
export const STORE_ID = "0190a000-0000-7000-8000-0000000000d1";
export const VENDOR_ID = "0190a000-0000-7000-8000-0000000000f1";
export const MASON_ID = "0190a000-0000-7000-8000-0000000000f2";

/** The pickers' choices as the filter options route answers. */
export const FILTER_OPTIONS = {
  projects: [
    { id: TOWER_ID, name: "Kumari Heights, Tower A" },
    { id: VILLA_ID, name: "Villa Phase 2" },
  ],
  stores: [{ id: STORE_ID, name: "Central Store Ambattur" }],
  vendors: [{ id: VENDOR_ID, name: "Ganesh Labour Supply" }],
  labourCategories: [{ id: MASON_ID, name: "Mason" }],
  suppliers: [
    {
      id: "0190a000-0000-7000-8000-0000000000f3",
      name: "Sri Murugan Traders",
    },
  ],
  materialCategories: [
    { id: "0190a000-0000-7000-8000-0000000000f4", name: "Cement" },
  ],
  materials: [
    { id: "0190a000-0000-7000-8000-0000000000f5", name: "Cement OPC 53" },
  ],
  creators: [{ id: "user-1", name: "Prabhu Saravanan" }],
};

export const CENTRAL_REPORTS_LIST_PATH = API;

export const DONE_CENTRAL_STOCK = job({
  id: "0190a000-0000-7000-8000-0000000000b9",
  kind: "stock_register",
  title: "Stock Register",
  projectId: null,
  params: { from: "2026-10-01", to: "2026-10-09" },
});
