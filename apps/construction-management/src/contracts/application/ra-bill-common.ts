import { pendingState } from "@/src/shared-kernel/approval";
import {
  approvalEvent,
  type ApprovalOutcome,
} from "@/src/shared-kernel/approval-events";
import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import type { EventDispatcher } from "@/src/shared-kernel/events";

import type { BillStatus } from "../domain/contract-terms";
import {
  billChanged,
  billNotPending,
  retentionTotal,
  type RaBillDeduction,
  type RetentionSuggestion,
} from "../domain/ra-bill";
import type { StoredBillDeduction } from "./contractor-bill-ports";

/**
 * The application steps both RA bill sides share (CM-1106, CM-1107): the
 * stale check, the approval kernel's state, the `document.*` event, how a
 * draft's deductions are planned and what an audit snapshot keeps.
 */

export const uniqueIds = (ids: readonly (string | null)[]): string[] => [
  ...new Set(ids.filter((id): id is string => id != null && id !== "")),
];

/** 409 `BILL_CHANGED` when `expected` is sent and the bill moved on. */
export function assertNotStale(
  bill: { updatedAt: Date },
  expected: Date | null,
): void {
  if (expected != null && bill.updatedAt.getTime() !== expected.getTime())
    throw billChanged();
}

/** The kernel decides only a pending bill (409 `BILL_NOT_PENDING`). */
export function pendingApproval(status: BillStatus) {
  if (status !== "pending_approval") throw billNotPending(status);
  return pendingState();
}

/** `document.submitted|approved|rejected` for a bill, after commit. */
export async function dispatchBillApproval(
  events: EventDispatcher,
  documentType: string,
  bill: {
    id: string;
    workspaceId: string;
    projectId: string;
    number: string | null;
    createdBy: string;
  },
  outcome: ApprovalOutcome,
  by: string,
  at: Date,
): Promise<void> {
  await events.dispatch([
    approvalEvent(
      {
        workspaceId: bill.workspaceId,
        documentType,
        documentId: bill.id,
        projectId: bill.projectId,
        number: bill.number,
        createdBy: bill.createdBy,
      },
      outcome,
      by,
      at,
    ),
  ]);
}

/** How a draft's deductions are found when its figures are worked out. */
export type DeductionPlan<I> =
  | { kind: "suggest" }
  | { kind: "given"; inputs: readonly I[] }
  | {
      kind: "keep";
      stored: readonly StoredBillDeduction[];
      previousGross: bigint;
    };

/**
 * A draft's deductions by `plan`: the suggested retention for a new draft;
 * the typed ones (checked by `check`); or the stored ones, where retention
 * left at the old suggestion follows the new gross and typed retention
 * stays, cut to what the cap now allows.
 */
export function plannedDeductions<K extends RaBillDeduction["kind"], I>(
  plan: DeductionPlan<I>,
  retention: RetentionSuggestion,
  suggestionFor: (gross: bigint) => RetentionSuggestion,
  check: (inputs: readonly I[]) => RaBillDeduction<K>[],
): RaBillDeduction<K>[] {
  const retentionLine = (amount: bigint): RaBillDeduction<K>[] =>
    amount > 0n
      ? [
          {
            kind: "retention" as K,
            amount,
            description: null,
            advanceId: null,
          },
        ]
      : [];
  if (plan.kind === "suggest") return retentionLine(retention.suggested);
  if (plan.kind === "given") return check(plan.inputs);
  const kept: RaBillDeduction<K>[] = plan.stored.map((row) => ({
    kind: row.kind as K,
    amount: row.amount,
    description: row.description,
    advanceId: row.advanceId,
  }));
  const others = kept.filter((row) => row.kind !== "retention");
  const held = retentionTotal(kept);
  const untouched = held === suggestionFor(plan.previousGross).suggested;
  return untouched || held > retention.suggested
    ? [...retentionLine(retention.suggested), ...others]
    : kept;
}

/** What an audit entry keeps of any RA bill. */
export function raBillSnapshot(
  bill: {
    number: string | null;
    ordinal: number | null;
    status: BillStatus;
    billDate: CalendarDate;
    measuredUpTo: CalendarDate;
    isFinal: boolean;
    gross: bigint;
    cgst: bigint;
    sgst: bigint;
    igst: bigint;
    reverseCharge: boolean;
    deductionsTotal: bigint;
    net: bigint;
    invoiceId: string | null;
    rejectReason: string | null;
    reverseReason: string | null;
  },
  extra: Record<string, unknown> = {},
) {
  return {
    number: bill.number,
    ordinal: bill.ordinal,
    status: bill.status,
    ...extra,
    billDate: bill.billDate,
    measuredUpTo: bill.measuredUpTo,
    isFinal: bill.isFinal,
    gross: Number(bill.gross),
    gst: Number(bill.cgst + bill.sgst + bill.igst),
    reverseCharge: bill.reverseCharge,
    deductions: Number(bill.deductionsTotal),
    net: Number(bill.net),
    invoiceId: bill.invoiceId,
    rejectReason: bill.rejectReason,
    reverseReason: bill.reverseReason,
  };
}
