import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import type { EventDispatcher } from "@/src/shared-kernel/events";
import type {
  LocationRef,
  LocationResolver,
} from "@/src/shared-kernel/location-ref";

import type { MeasurementStatus, Side } from "../domain/contract-terms";
import type { BoqDb, BoqStore } from "./boq-ports";
import type { ContractsDirectory, ContractsTx } from "./ports";
import type { WorkOrderStore } from "./work-order-ports";

/**
 * What the Measurement Book keeps (CM-1105), and the store that keeps it
 * (Prisma in `infrastructure/prisma-measurement-store.ts`). Every command
 * runs in one transaction that first takes the Project's BOQ lock (the
 * lock CM-1103 and CM-1104 take), so a check, reopen or delete and a BOQ
 * or Work Order change on the same Project never cross: what counts as
 * "measured" is decided one writer at a time.
 */

export const MEASUREMENT_MENU = "contracts.measurements";

export type StoredMeasurementSheet = {
  id: string;
  workspaceId: string;
  projectId: string;
  side: Side;
  /** Contractor side only. */
  workOrderId: string | null;
  measuredOn: CalendarDate;
  status: MeasurementStatus;
  title: string | null;
  remarks: string | null;
  submittedAt: Date | null;
  submittedBy: string | null;
  /** Our engineer: who checked it. */
  checkedAt: Date | null;
  checkedBy: string | null;
  partyName: string | null;
  partyRole: string | null;
  jointOn: CalendarDate | null;
  returnReason: string | null;
  reopenReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
};

export type StoredMeasurementRow = {
  id: string;
  sheetId: string;
  boqItemId: string | null;
  workOrderLineId: string | null;
  description: string | null;
  location: LocationRef | null;
  /** Ten-thousandths; null when blank (or a direct row). */
  nos: bigint | null;
  length: bigint | null;
  breadth: bigint | null;
  depth: bigint | null;
  direct: boolean;
  /** Ten-thousandths; negative for a deduction. */
  quantity: bigint;
  position: number;
  /** The bill that took the row (CM-1106). */
  billId: string | null;
};

/** A photo on a sheet (attachments, not the Gallery). */
export type StoredMeasurementPhoto = {
  id: string;
  workspaceId: string;
  projectId: string;
  sheetId: string;
  fileKey: string;
  fileName: string;
  contentType: string;
  bytes: number;
  thumbKey: string | null;
  createdAt: Date;
  createdBy: string;
};

/** A list position: latest measured first, then newest (root ADR-0020). */
export type MeasurementCursor = { measuredOn: CalendarDate; id: string };

export type MeasurementFilter = {
  workspaceId: string;
  projectId: string;
  side?: Side;
  workOrderId?: string;
  status?: MeasurementStatus;
  /** Measured on or after. */
  from?: CalendarDate;
  /** Measured on or before. */
  to?: CalendarDate;
};

/** Ten-thousandths per item (BOQ item or Work Order line). */
export type QuantitiesByItem = Map<string, bigint>;

export type MeasurementStore = {
  list(
    db: ContractsTx,
    params: MeasurementFilter & {
      limit: number;
      after?: MeasurementCursor;
      before?: MeasurementCursor;
    },
  ): Promise<{
    items: StoredMeasurementSheet[];
    total: number;
    hasMore: boolean;
  }>;
  find(
    db: ContractsTx,
    workspaceId: string,
    id: string,
  ): Promise<StoredMeasurementSheet | null>;
  /** Rows of these sheets, in sheet then position order. */
  rows(
    db: ContractsTx,
    workspaceId: string,
    sheetIds: readonly string[],
  ): Promise<StoredMeasurementRow[]>;
  insert(tx: ContractsTx, sheet: StoredMeasurementSheet): Promise<void>;
  /** Writes every field; false when `updatedAt` is not `expectedUpdatedAt`. */
  update(
    tx: ContractsTx,
    after: StoredMeasurementSheet,
    expectedUpdatedAt: Date,
  ): Promise<boolean>;
  /** Replaces a draft's rows (new ids, positions as given). */
  replaceRows(
    tx: ContractsTx,
    workspaceId: string,
    sheetId: string,
    rows: readonly StoredMeasurementRow[],
  ): Promise<void>;
  /** A tombstone; false when `updatedAt` is not `expectedUpdatedAt` (when given). */
  delete(
    tx: ContractsTx,
    input: {
      sheet: StoredMeasurementSheet;
      expectedUpdatedAt: Date | null;
      by: string;
      at: Date;
    },
  ): Promise<boolean>;
  /** Rows of the sheet a bill has taken. */
  billedRows(
    db: ContractsTx,
    workspaceId: string,
    sheetId: string,
  ): Promise<number>;
  /**
   * The quantity measured per item on the Project's live sheets of a side
   * in `statuses` (BOQ items on the client side, Work Order lines on the
   * contractor side), leaving out `exceptSheetId`.
   */
  measuredByItem(
    db: ContractsTx,
    input: {
      workspaceId: string;
      projectId: string;
      side: Side;
      statuses: readonly MeasurementStatus[];
      exceptSheetId: string | null;
    },
  ): Promise<QuantitiesByItem>;
  /** Live photos of the sheet, oldest first. */
  photos(
    db: ContractsTx,
    workspaceId: string,
    sheetId: string,
  ): Promise<StoredMeasurementPhoto[]>;
  /** Live photo counts by sheet. */
  photoCounts(
    db: ContractsTx,
    workspaceId: string,
    sheetIds: readonly string[],
  ): Promise<Map<string, number>>;
  /** A photo by key, removed ones included (a retried completion). */
  photoByKey(
    db: ContractsTx,
    workspaceId: string,
    sheetId: string,
    key: string,
  ): Promise<(StoredMeasurementPhoto & { deletedAt: Date | null }) | null>;
  insertPhoto(tx: ContractsTx, photo: StoredMeasurementPhoto): Promise<void>;
  /** A tombstone; false when it was already gone. */
  removePhoto(
    tx: ContractsTx,
    input: { photo: StoredMeasurementPhoto; by: string; at: Date },
  ): Promise<boolean>;
  /** "Who did this" names by User id. */
  names(
    db: ContractsTx,
    workspaceId: string,
    userIds: readonly string[],
  ): Promise<Map<string, string>>;
};

/** Checks one date against the Back-dated Entry policy (`loadBackdatedCheck`). */
export type MeasurementBackdatedCheck = (
  module: "measurement",
  action: "create" | "edit",
  date: CalendarDate,
) => void;

export type MeasurementDeps = {
  db: BoqDb;
  store: MeasurementStore;
  /** The Project's BOQ: its lock, items and the deviation limit. */
  boq: BoqStore;
  /** Issued Work Orders and their lines (contractor side). */
  workOrders: WorkOrderStore;
  directory: ContractsDirectory;
  /** A row's `LocationRef` is checked against the Project. */
  locations: LocationResolver;
  backdated: (access: {
    workspaceId: string;
    userId: string;
    role: "owner" | "member";
  }) => Promise<MeasurementBackdatedCheck>;
  /** The Company's today: no measurement or joint date after it. */
  today: (workspaceId: string) => Promise<CalendarDate>;
  /** `MeasurementSubmitted`, after commit. */
  events: EventDispatcher;
  clock?: () => Date;
};
