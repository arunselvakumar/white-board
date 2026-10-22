import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import type { EventDispatcher } from "@/src/shared-kernel/events";

import type {
  IssueBasis,
  WorkOrderLineKind,
  WorkOrderStatus,
} from "../domain/contract-terms";
import type { WorkOrderTerms } from "../domain/work-order";
import type { BoqDb, BoqStore } from "./boq-ports";
import type { ContractsDirectory, ContractsTx } from "./ports";

/**
 * What Work Orders keep (CM-1104), and the store that keeps them (Prisma
 * in `infrastructure/prisma-work-order-store.ts`). Every command runs in
 * one transaction that first takes the Project's BOQ lock, so a Work
 * Order change and a BOQ change on the same Project never cross: the BOQ
 * item delete guard and the remaining quantity read what is committed.
 */

export const WORK_ORDER_MENU = "contracts.work_orders";

/** The approval document type messaging links to Work Orders (`APPROVAL_DOCUMENTS`). */
export const WORK_ORDER_DOCUMENT_TYPE = "work_order";

export type StoredWorkOrder = {
  id: string;
  workspaceId: string;
  projectId: string;
  contractorId: string;
  departmentId: string | null;
  /** Null until first submitted. */
  number: string | null;
  orderDate: CalendarDate;
  validUntil: CalendarDate | null;
  scope: string | null;
  status: WorkOrderStatus;
  /** 0 until the first amendment. */
  revision: number;
  terms: WorkOrderTerms;
  completedOn: CalendarDate | null;
  decidedAt: Date | null;
  decidedBy: string | null;
  rejectReason: string | null;
  closedOn: CalendarDate | null;
  closeReason: string | null;
  cancelledOn: CalendarDate | null;
  cancelReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
};

export type StoredWorkOrderLine = {
  id: string;
  workOrderId: string;
  kind: WorkOrderLineKind;
  boqItemId: string | null;
  itemNo: string | null;
  description: string;
  uomId: string;
  sacHsn: string | null;
  /** Ten-thousandths of the UoM. */
  quantity: bigint;
  /** Paise per UoM. */
  rate: bigint;
  position: number;
};

export type StoredWorkOrderMaterial = {
  id: string;
  workOrderId: string;
  materialId: string;
  issueBasis: IssueBasis;
  issueRate: bigint | null;
  /** Hundredths of a percent. */
  wastagePercent: bigint;
  penalRate: bigint | null;
  /** Ten-thousandths of the material UoM per unit of each line. */
  coefficients: { lineId: string; coefficient: bigint }[];
};

/**
 * What a revision snapshot keeps, as the API shows it: decimals as
 * fixed strings, paise as numbers. Names are kept so an old revision
 * reads the same after a master is renamed.
 */
export type WorkOrderSnapshot = {
  revision: number;
  number: string | null;
  contractorId: string;
  contractorName: string;
  departmentId: string | null;
  departmentName: string | null;
  orderDate: string;
  validUntil: string | null;
  scope: string | null;
  terms: {
    retentionPercent: string;
    retentionCapPercent: string | null;
    retentionCompletionPercent: string;
    dlpMonths: number | null;
    tdsNature: string | null;
    sacCode: string | null;
    gstRate: string | null;
    reverseCharge: boolean;
    mobilisationAdvance: number | null;
    mobilisationRecoveryPercent: string | null;
  };
  lines: {
    id: string;
    kind: WorkOrderLineKind;
    boqItemId: string | null;
    itemNo: string | null;
    description: string;
    uomId: string;
    uomName: string;
    sacHsn: string | null;
    quantity: string;
    rate: number;
    amount: number;
  }[];
  value: number;
  materials: {
    materialId: string;
    materialName: string;
    issueBasis: IssueBasis;
    issueRate: number | null;
    wastagePercent: string;
    penalRate: number | null;
    coefficients: { lineId: string; coefficient: string }[];
  }[];
};

export type StoredWorkOrderRevision = {
  id: string;
  workOrderId: string;
  /** The revision kept: the one the amendment replaced. */
  revision: number;
  /** Why it was amended. */
  reason: string | null;
  snapshot: WorkOrderSnapshot;
  createdAt: Date;
  createdBy: string;
};

/** A list position: newest first (root ADR-0020). */
export type WorkOrderCursor = { createdAt: Date; id: string };

export type WorkOrderFilter = {
  workspaceId: string;
  projectId: string;
  status?: WorkOrderStatus;
  contractorId?: string;
  /** Part of the number or the scope note, ignoring case. */
  search?: string;
};

export type WorkOrderStore = {
  list(
    db: ContractsTx,
    params: WorkOrderFilter & {
      limit: number;
      after?: WorkOrderCursor;
      before?: WorkOrderCursor;
    },
  ): Promise<{ items: StoredWorkOrder[]; total: number; hasMore: boolean }>;
  find(
    db: ContractsTx,
    workspaceId: string,
    id: string,
  ): Promise<StoredWorkOrder | null>;
  /** Live lines of these Work Orders, in Work Order then position order. */
  lines(
    db: ContractsTx,
    workspaceId: string,
    workOrderIds: readonly string[],
  ): Promise<StoredWorkOrderLine[]>;
  materials(
    db: ContractsTx,
    workspaceId: string,
    workOrderId: string,
  ): Promise<StoredWorkOrderMaterial[]>;
  /** Newest first. */
  revisions(
    db: ContractsTx,
    workspaceId: string,
    workOrderId: string,
  ): Promise<StoredWorkOrderRevision[]>;
  insert(tx: ContractsTx, workOrder: StoredWorkOrder): Promise<void>;
  /** Writes every field; false when `updatedAt` is not `expectedUpdatedAt`. */
  update(
    tx: ContractsTx,
    after: StoredWorkOrder,
    expectedUpdatedAt: Date,
  ): Promise<boolean>;
  /**
   * Writes the lines as given (new ids inserted, known ids updated) and
   * tombstones the live lines not listed.
   */
  saveLines(
    tx: ContractsTx,
    input: {
      workspaceId: string;
      workOrderId: string;
      lines: readonly StoredWorkOrderLine[];
      by: string;
      at: Date;
    },
  ): Promise<void>;
  /** Replaces the materials and their coefficients. */
  replaceMaterials(
    tx: ContractsTx,
    workspaceId: string,
    workOrderId: string,
    materials: readonly StoredWorkOrderMaterial[],
  ): Promise<void>;
  delete(
    tx: ContractsTx,
    input: {
      workOrder: StoredWorkOrder;
      expectedUpdatedAt: Date | null;
      by: string;
      at: Date;
    },
  ): Promise<boolean>;
  insertRevision(
    tx: ContractsTx,
    workspaceId: string,
    revision: StoredWorkOrderRevision,
  ): Promise<void>;
  /**
   * Ten-thousandths ordered per BOQ item by the live lines of the
   * Project's live, non-cancelled Work Orders other than `exceptId`.
   */
  orderedElsewhere(
    db: ContractsTx,
    workspaceId: string,
    projectId: string,
    exceptId: string | null,
  ): Promise<Map<string, bigint>>;
  /** Ten-thousandths billed per line on the Work Order's approved bills. */
  billedByLine(
    db: ContractsTx,
    workspaceId: string,
    workOrderId: string,
  ): Promise<Map<string, bigint>>;
  /** Live bills on the Work Order still draft or pending approval. */
  openBills(
    db: ContractsTx,
    workspaceId: string,
    workOrderId: string,
  ): Promise<number>;
  /**
   * The material lines of these library Items' rate analyses:
   * coefficient (ten-thousandths) by Material, by Item.
   */
  analysisMaterials(
    db: ContractsTx,
    workspaceId: string,
    libraryItemIds: readonly string[],
  ): Promise<Map<string, Map<string, bigint>>>;
  /** "Who did this" names by User id. */
  names(
    db: ContractsTx,
    workspaceId: string,
    userIds: readonly string[],
  ): Promise<Map<string, string>>;
};

/** Checks one date against the Back-dated Entry policy (`loadBackdatedCheck`). */
export type WorkOrderBackdatedCheck = (
  module: "work_order",
  action: "create" | "edit",
  date: CalendarDate,
) => void;

export type WorkOrderDeps = {
  db: BoqDb;
  store: WorkOrderStore;
  /** The Project's BOQ: its lock, items and sections. */
  boq: BoqStore;
  directory: ContractsDirectory;
  backdated: (access: {
    workspaceId: string;
    userId: string;
    role: "owner" | "member";
  }) => Promise<WorkOrderBackdatedCheck>;
  /** The Company's today: a cancel's date. */
  today: (workspaceId: string) => Promise<CalendarDate>;
  /** `document.submitted|approved|rejected` and `WorkOrderIssued`, after commit. */
  events: EventDispatcher;
  clock?: () => Date;
};
