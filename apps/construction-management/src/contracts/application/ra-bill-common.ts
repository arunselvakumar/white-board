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
  /**
   * What was suggested when the stored draft was last worked out, when it
   * depends on more than the gross (CM-1110: the material recoveries
   * follow the bill's lines and date). Defaults to `suggest(previousGross)`.
   */
  suggestBefore?: (previousGross: bigint) => RaBillDeduction<K>[];
};

/**
 * What a suggested line is matched by on a refresh: its advance (CM-1108)
 * or its kind and Material (CM-1110); null for lines nothing suggests.
 */
function suggestionKey(row: {
  kind: string;
  advanceId: string | null;
  materialId: string | null;
}): string | null {
  if (row.advanceId != null) return `advance:${row.advanceId}`;
  if (row.materialId != null) return `${row.kind}:${row.materialId}`;
  return null;
}

function keyed<K extends RaBillDeduction["kind"]>(
  rows: readonly RaBillDeduction<K>[],
): Map<string, RaBillDeduction<K>> {
  const out = new Map<string, RaBillDeduction<K>>();
  for (const row of rows) {
    const key = suggestionKey(row);
    if (key != null) out.set(key, row);
  }
  return out;
}

/**
 * A draft's deductions by `plan`: the suggested retention and advance
 * recoveries (CM-1108) for a new draft; the typed ones (checked by
 * `check`); or the stored ones, where retention left at the old suggestion
 * follows the new gross and typed retention stays, cut to what the cap now
 * allows, and a recovery left at its old suggestion follows the new one
 * (gone when nothing is left to recover). A material deduction (CM-1110)
 * newly suggested where nothing was suggested before is added.
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
            escalationBillId: null,
            materialId: null,
          },
        ]
      : [];
  if (plan.kind === "suggest")
    return [
      ...retentionLine(retention.suggested),
      ...(recoveries?.suggest(recoveries.gross) ?? []),
    ];
  if (plan.kind === "given") return check(plan.inputs);
  const before = keyed(
    recoveries == null
      ? []
      : (recoveries.suggestBefore ?? recoveries.suggest)(plan.previousGross),
  );
  const now = keyed(recoveries?.suggest(recoveries.gross) ?? []);
  const kept: RaBillDeduction<K>[] = plan.stored.flatMap((row) => {
    const line = {
      kind: row.kind as K,
      amount: row.amount,
      description: row.description,
      advanceId: row.advanceId,
      escalationBillId: row.escalationBillId,
      materialId: row.materialId,
    };
    const key = suggestionKey(line);
    if (
      recoveries == null ||
      key == null ||
      before.get(key)?.amount !== row.amount
    )
      return [line];
    const next = now.get(key)?.amount ?? 0n;
    return next > 0n ? [{ ...line, amount: next }] : [];
  });
  const storedKeys = new Set(
    plan.stored.map((row) => suggestionKey(row)).filter((key) => key != null),
  );
  const added = [...now.entries()]
    .filter(
      ([key, row]) =>
        row.materialId != null && !storedKeys.has(key) && !before.has(key),
    )
    .map(([, row]) => row);
  const others = [...kept.filter((row) => row.kind !== "retention"), ...added];
  const held = retentionTotal(kept);
  const untouched = held === suggestionFor(plan.previousGross).suggested;
  return untouched || held > retention.suggested
    ? [...retentionLine(retention.suggested), ...others]
    : [...kept, ...added];
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
