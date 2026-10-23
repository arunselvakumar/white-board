import type { CalendarDate } from "@/src/shared-kernel/calendar-date";

import type { BillStatus, DeductionKind } from "../domain/contract-terms";
import type { AttributionCandidate } from "../domain/material-reconciliation";
import type { ContractsTx } from "./ports";

/**
 * What material reconciliation (CM-1110) reads: issues and returns from
 * procurement through `MaterialIssues` (contracts never imports
 * procurement; `src/composition/contracts-material-issues.ts` adapts its
 * tables), and the Work Order's running bills, billed quantities and
 * material deductions through `ReconciliationStore`.
 */

/**
 * A delivered Delivery Note line of a Material Request raised for a
 * Contractor on a Project: material issued to that Contractor.
 */
export type ContractorIssue = {
  /** The Delivery Note line. */
  id: string;
  deliveryNoteId: string;
  deliveryNoteNumber: string;
  materialRequestId: string;
  materialRequestNumber: string;
  /** When the Contractor got it: the note's "delivered on". */
  date: CalendarDate;
  materialId: string;
  /** Thousandths of the material UoM. */
  quantity: bigint;
  /** The Work Order the Material Request names, if any. */
  workOrderId: string | null;
};

/** Material a Contractor gave back (none yet: procurement has no return flow). */
export type ContractorReturn = {
  id: string;
  date: CalendarDate;
  materialId: string;
  /** Thousandths. */
  quantity: bigint;
  workOrderId: string | null;
};

export type MaterialIssues = {
  /** Every delivered issue to the Contractor on the Project of these materials. */
  issuesTo(
    db: ContractsTx,
    workspaceId: string,
    query: {
      projectId: string;
      contractorId: string;
      materialIds: readonly string[];
    },
  ): Promise<ContractorIssue[]>;
  /**
   * Returns from the Contractor. Procurement records none today (no
   * return flow: stock movements are consumed, missing and adjustment),
   * so the adapter answers none; a return flow plugs in here.
   */
  returnsFrom(
    db: ContractsTx,
    workspaceId: string,
    query: {
      projectId: string;
      contractorId: string;
      materialIds: readonly string[];
    },
  ): Promise<ContractorReturn[]>;
};

export const NO_MATERIAL_ISSUES: MaterialIssues = {
  issuesTo: () => Promise.resolve([]),
  returnsFrom: () => Promise.resolve([]),
};

/** A live running bill of a Work Order. */
export type ReconciliationBillRef = {
  id: string;
  number: string | null;
  ordinal: number | null;
  status: BillStatus;
  billDate: CalendarDate;
  measuredUpTo: CalendarDate;
};

/** A material deduction on a bill. */
export type MaterialDeductionRow = {
  billId: string;
  kind: DeductionKind;
  materialId: string;
  amount: bigint;
  description: string | null;
};

export type ReconciliationStore = {
  /** The Work Order's live running bills, oldest first. */
  runningBills(
    db: ContractsTx,
    workspaceId: string,
    workOrderId: string,
  ): Promise<ReconciliationBillRef[]>;
  /** Σ line quantity (ten-thousandths) per Work Order line over these bills. */
  billedByLine(
    db: ContractsTx,
    workspaceId: string,
    billIds: readonly string[],
  ): Promise<Map<string, bigint>>;
  /** Material deductions (naming a material) on these bills. */
  materialDeductions(
    db: ContractsTx,
    workspaceId: string,
    billIds: readonly string[],
  ): Promise<MaterialDeductionRow[]>;
  /**
   * The Contractor's Work Orders on the Project an issue may count
   * towards: issued or closed, with the materials each issues.
   */
  candidates(
    db: ContractsTx,
    workspaceId: string,
    projectId: string,
    contractorId: string,
  ): Promise<AttributionCandidate[]>;
  /**
   * Σ line quantity per Work Order line over the Work Order's approved
   * running bills dated in the period (escalation's 10CA quantity).
   */
  billedInPeriod(
    db: ContractsTx,
    workspaceId: string,
    workOrderId: string,
    period: { from: CalendarDate; to: CalendarDate },
  ): Promise<Map<string, bigint>>;
};
