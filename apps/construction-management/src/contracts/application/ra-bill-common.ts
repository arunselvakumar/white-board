import { pendingState } from "@/src/shared-kernel/approval";
import {
  approvalEvent,
  type ApprovalOutcome,
} from "@/src/shared-kernel/approval-events";
import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import type { EventDispatcher } from "@/src/shared-kernel/events";

import {
  advanceBalance,
  isRecoveryKind,
  recoveryKindOf,
  recoverySuggestion,
  type RecoverableAdvance,
} from "../domain/advance";
import type { BillStatus, DeductionKind } from "../domain/contract-terms";
import {
  billChanged,
  billNotPending,
  retentionTotal,
  type RaBillDeduction,
  type RetentionSuggestion,
} from "../domain/ra-bill";
import type { StoredBillDeduction } from "./contractor-bill-ports";
import type { RecoveryAllocation } from "./ports";

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

/** The advances' suggested recoveries at a gross (CM-1108), and the gross now. */
export type RecoveryPlan<K extends RaBillDeduction["kind"]> = {
  gross: bigint;
  suggest: (gross: bigint) => RaBillDeduction<K>[];
};

/**
 * A draft's deductions by `plan`: the suggested retention and advance
 * recoveries (CM-1108) for a new draft; the typed ones (checked by
 * `check`); or the stored ones, where retention left at the old suggestion
 * follows the new gross and typed retention stays, cut to what the cap now
 * allows, and a recovery left at its old suggestion follows the new one
 * (gone when nothing is left to recover).
 */
export function plannedDeductions<K extends RaBillDeduction["kind"], I>(
  plan: DeductionPlan<I>,
  retention: RetentionSuggestion,
  suggestionFor: (gross: bigint) => RetentionSuggestion,
  check: (inputs: readonly I[]) => RaBillDeduction<K>[],
  recoveries?: RecoveryPlan<K>,
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
  if (plan.kind === "suggest")
    return [
      ...retentionLine(retention.suggested),
      ...(recoveries?.suggest(recoveries.gross) ?? []),
    ];
  if (plan.kind === "given") return check(plan.inputs);
  const before = new Map(
    (recoveries?.suggest(plan.previousGross) ?? []).map((row) => [
      row.advanceId,
      row.amount,
    ]),
  );
  const now = new Map(
    (recoveries?.suggest(recoveries.gross) ?? []).map((row) => [
      row.advanceId,
      row.amount,
    ]),
  );
  const kept: RaBillDeduction<K>[] = plan.stored.flatMap((row) => {
    const line = {
      kind: row.kind as K,
      amount: row.amount,
      description: row.description,
      advanceId: row.advanceId,
    };
    if (
      recoveries == null ||
      row.advanceId == null ||
      before.get(row.advanceId) !== row.amount
    )
      return [line];
    const next = now.get(row.advanceId) ?? 0n;
    return next > 0n ? [{ ...line, amount: next }] : [];
  });
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

/** An advance of the bill's contract as the bill page shows it (CM-1108). */
export type BillAdvanceView = RecoverableAdvance & {
  /** What this bill would recover by the rule: min(rule, balance). */
  suggested: bigint;
  /** amount − recovered on other approved bills. */
  balance: bigint;
  /** The deduction kind that recovers it. */
  recoveryKind: DeductionKind;
};

export function billAdvanceViews(
  advances: readonly RecoverableAdvance[],
  gross: bigint,
): BillAdvanceView[] {
  return advances.map((advance) => ({
    ...advance,
    suggested: recoverySuggestion(advance, gross),
    balance: advanceBalance(advance),
    recoveryKind: recoveryKindOf(advance.kind),
  }));
}

/**
 * What approval allocates from each recovered advance's payment to the
 * bill's invoice (CM-1108): the recovery of every finance-paid advance.
 * The invoice amount is the net plus these.
 */
export function recoveryAllocations(
  deductions: readonly {
    kind: string;
    amount: bigint;
    advanceId: string | null;
  }[],
  advances: readonly RecoverableAdvance[],
): RecoveryAllocation[] {
  const payments = new Map(
    advances.map((advance) => [advance.id, advance.paymentId]),
  );
  const out = new Map<string, bigint>();
  for (const deduction of deductions) {
    if (!isRecoveryKind(deduction.kind) || deduction.advanceId == null)
      continue;
    const paymentId = payments.get(deduction.advanceId);
    if (paymentId == null) continue;
    out.set(paymentId, (out.get(paymentId) ?? 0n) + deduction.amount);
  }
  return [...out].map(([paymentId, amount]) => ({ paymentId, amount }));
}

export function allocationsTotal(rows: readonly RecoveryAllocation[]): bigint {
  return rows.reduce((sum, row) => sum + row.amount, 0n);
}
