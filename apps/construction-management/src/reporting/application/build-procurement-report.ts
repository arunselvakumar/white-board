import {
  buildMaterialReceivedReport,
  buildMaterialTransferReport,
  buildPurchaseOrderReport,
  buildPurchaseRequestReport,
  buildStockRegisterReport,
  type ProcurementReportScope,
} from "../domain/procurement-reports";
import type { ReportBody } from "../domain/report-document";
import type {
  ReportJob,
  ReportParams,
  ReportPlaces,
} from "../domain/report-job";
import type {
  ProcurementFilterNames,
  ProcurementReportPlaces,
  ProcurementReportSource,
} from "./ports";

export type ProcurementReportParams = Extract<
  ReportParams,
  {
    kind:
      | "purchase_requests"
      | "purchase_orders"
      | "material_received"
      | "material_transfers"
      | "stock_register";
  }
>;

/** The procurement table reports (CM-903). */
export const PROCUREMENT_TABLE_KINDS: readonly ReportJob["kind"][] = [
  "purchase_requests",
  "purchase_orders",
  "material_received",
  "material_transfers",
  "stock_register",
];

/** Wide procurement registers print on A3. */
export const PROCUREMENT_A3_KINDS = PROCUREMENT_TABLE_KINDS;

const APPROVAL_LABELS = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
} as const;

const TRANSFER_STATUS_LABELS = {
  pending: "Pending",
  in_transit: "In transit",
  delivered: "Delivered",
  rejected: "Rejected",
} as const;

const TRANSFER_TYPE_LABELS = {
  project_to_project: "Project to Project",
  project_to_store: "Project to Store",
  store_to_project: "Store to Project",
  store_to_store: "Store to Store",
} as const;

/** A Project's report reads that Project only; a central one its places. */
function placesOf(
  job: ReportJob,
  params: ReportPlaces,
): ProcurementReportPlaces {
  return job.projectId == null
    ? { projectIds: params.projectIds, storeIds: params.storeIds }
    : { projectIds: [job.projectId], storeIds: [] };
}

/**
 * What a central report reads, in words, from its fixed places: the
 * Projects (every one, the ones the member is on, or the chosen ones) and
 * the Stores (every one, the chosen one, or none).
 */
function coversOf(
  params: ReportPlaces,
  store: string | null | undefined,
  withStores: boolean,
): string {
  const projects =
    params.projectIds == null
      ? "every Project"
      : params.projectsChosen
        ? "the Projects you chose"
        : params.projectIds.length === 0
          ? null
          : "the Projects you are on";
  const stores = !withStores
    ? null
    : params.storeIds == null
      ? "every Central Store"
      : params.storeIds.length === 0
        ? null
        : store == null
          ? "the chosen Store"
          : `the Store ${store}`;
  if (projects != null && stores != null) return `${projects} and ${stores}`;
  return projects ?? stores ?? "no Project or Store you may see";
}

function scopeOf(
  job: ReportJob,
  params: ReportPlaces,
  filters: readonly (string | null)[],
  options: { store?: string | null; withStores?: boolean } = {},
): ProcurementReportScope {
  const central = job.projectId == null;
  return {
    central,
    covers: central
      ? coversOf(params, options.store, options.withStores ?? true)
      : null,
    filters: filters.filter((item): item is string => item != null),
  };
}

function named(label: string, value: string | null | undefined) {
  return value == null ? null : `${label}: ${value}`;
}

function nameFilters(names: ProcurementFilterNames): (string | null)[] {
  return [
    named("Supplier", names.supplier),
    named("Category", names.category),
    named("Material", names.material),
    named("Created By", names.createdBy),
  ];
}

/** The body of a procurement report (CM-903). */
export async function procurementReportBody(
  job: ReportJob,
  params: ProcurementReportParams,
  source: ProcurementReportSource | undefined,
): Promise<ReportBody> {
  if (source == null)
    throw new Error("The procurement report source is not wired.");
  const range = { from: params.from, to: params.to };
  const places = placesOf(job, params);
  switch (params.kind) {
    case "purchase_requests": {
      const data = await source.purchaseRequests(job.workspaceId, {
        range,
        projectIds: places.projectIds,
        status: params.status,
        categoryId: params.categoryId,
        materialId: params.materialId,
        createdBy: params.createdBy,
      });
      return buildPurchaseRequestReport({
        rows: data.rows,
        scope: scopeOf(
          job,
          params,
          [
            params.status == null
              ? null
              : `Status: ${APPROVAL_LABELS[params.status]}`,
            ...nameFilters(data.names),
          ],
          { withStores: false },
        ),
      });
    }
    case "purchase_orders": {
      const data = await source.purchaseOrders(job.workspaceId, {
        range,
        places,
        status: params.status,
        supplierId: params.supplierId,
      });
      return buildPurchaseOrderReport({
        rows: data.rows,
        financial: job.includesMoney,
        scope: scopeOf(job, params, [
          params.status == null
            ? null
            : `Status: ${APPROVAL_LABELS[params.status]}`,
          ...nameFilters(data.names),
        ]),
      });
    }
    case "material_received": {
      const data = await source.materialReceived(job.workspaceId, {
        range,
        places,
        supplierId: params.supplierId,
        ownBy: params.ownBy,
        financial: job.includesMoney,
      });
      return buildMaterialReceivedReport({
        rows: data.rows,
        financial: job.includesMoney,
        own: params.ownBy != null,
        scope: scopeOf(job, params, nameFilters(data.names)),
      });
    }
    case "material_transfers": {
      const rows = await source.materialTransfers(job.workspaceId, {
        range,
        places,
        status: params.status,
        transferType: params.transferType,
      });
      return buildMaterialTransferReport({
        rows,
        scope: scopeOf(job, params, [
          params.status == null
            ? null
            : `Status: ${TRANSFER_STATUS_LABELS[params.status]}`,
          params.transferType == null
            ? null
            : `Type: ${TRANSFER_TYPE_LABELS[params.transferType]}`,
        ]),
      });
    }
    case "stock_register": {
      const data = await source.stockRegister(job.workspaceId, {
        range,
        places,
        categoryId: params.categoryId,
        materialId: params.materialId,
      });
      return buildStockRegisterReport({
        rows: data.rows,
        scope: scopeOf(job, params, nameFilters(data.names), {
          store: data.names.store,
        }),
      });
    }
  }
}
