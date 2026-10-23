import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import { DomainError } from "@/src/shared-kernel/domain-error";

import type { DeductionKind } from "../domain/contract-terms";
import { escalationRecoveryReason } from "../domain/escalation";
import { rupees, type RaBillDeduction } from "../domain/ra-bill";
import type { ContractRef } from "./advance-ports";
import type { EscalationBillStore } from "./escalation-ports";
import type { ContractsTx } from "./ports";

/**
 * Negative escalation (CM-1109): when the indices fell, CPWD 10CC works
 * both ways. An approved escalation bill with a negative gross creates no
 * invoice; what it comes to is **recovered on the next running bills** of
 * the same contract as an "other" deduction naming it
 * (`bill_deductions.escalation_bill_id`, reason "Escalation recovery on
 * …"). A new running draft holds the suggestion beside retention and
 * advance recoveries, cut to what the bill can take; a recovery is never
 * more than what is left, and once per bill.
 */

export type OutstandingEscalation = {
  id: string;
  number: string | null;
  periodFrom: CalendarDate;
  periodTo: CalendarDate;
  /** Paise to recover: −gross. */
  amount: bigint;
  /** Σ recoveries on approved bills other than the one asked about. */
  recovered: bigint;
  /** amount − recovered. */
  balance: bigint;
  /** The deduction reason a recovery carries. */
  reason: string;
};

/** The contract's approved negative escalation bills and what is left of each. */
export async function outstandingEscalations(
  bills: EscalationBillStore,
  db: ContractsTx,
  workspaceId: string,
  contract: ContractRef,
  exceptBillId: string | null,
): Promise<OutstandingEscalation[]> {
  const refs = (await bills.ofContract(db, workspaceId, contract)).filter(
    (ref) => ref.status === "approved" && ref.gross < 0n,
  );
  if (refs.length === 0) return [];
  const recovered = await bills.recoveredByEscalation(
    db,
    workspaceId,
    refs.map((ref) => ref.id),
    exceptBillId,
  );
  return refs
    .map((ref) => {
      const amount = -ref.gross;
      const done = recovered.get(ref.id)?.approved ?? 0n;
      return {
        id: ref.id,
        number: ref.number,
        periodFrom: ref.periodFrom,
        periodTo: ref.periodTo,
        amount,
        recovered: done,
        balance: amount - done,
        reason: escalationRecoveryReason(
          ref.number,
          ref.periodFrom,
          ref.periodTo,
        ),
      };
    })
    .sort((a, b) => a.periodFrom.localeCompare(b.periodFrom));
}

/**
 * The recoveries a new running draft holds: oldest period first, each at
 * most its balance, all together at most `room` (what the bill can take
 * after retention and advance recoveries).
 */
export function suggestedEscalationRecoveries<K extends DeductionKind>(
  outstanding: readonly OutstandingEscalation[],
  room: bigint,
): RaBillDeduction<K>[] {
  let left = room > 0n ? room : 0n;
  const out: RaBillDeduction<K>[] = [];
  for (const row of outstanding) {
    const amount = row.balance < left ? row.balance : left;
    if (amount <= 0n) continue;
    left -= amount;
    out.push({
      kind: "other" as K,
      amount,
      description: row.reason,
      advanceId: null,
      escalationBillId: row.id,
      materialId: null,
    });
  }
  return out;
}

function recoveryField(
  code: string,
  message: string,
  index: number,
  details: Record<string, unknown> = {},
): DomainError {
  return new DomainError(code, message, {
    details: {
      deduction: index,
      field: `deductions.${String(index)}.escalationBillId`,
      ...details,
    },
  });
}

/**
 * A deduction naming an escalation bill names an approved negative one of
 * the same contract (400 `BILL_ESCALATION_RECOVERY_INVALID`), once per
 * bill (400 `BILL_ESCALATION_RECOVERY_DUPLICATE`), and takes no more than
 * what is left (400 `BILL_ESCALATION_RECOVERY_OVER_BALANCE`, `details.max`).
 */
export function assertEscalationRecoveries(
  deductions: readonly {
    amount: bigint;
    escalationBillId: string | null;
  }[],
  outstanding: readonly OutstandingEscalation[],
): void {
  const seen = new Set<string>();
  deductions.forEach((deduction, index) => {
    const id = deduction.escalationBillId;
    if (id == null) return;
    const found = outstanding.find((row) => row.id === id);
    if (found == null)
      throw recoveryField(
        "BILL_ESCALATION_RECOVERY_INVALID",
        "That escalation bill is not an approved negative escalation bill of this contract.",
        index,
      );
    if (seen.has(id))
      throw recoveryField(
        "BILL_ESCALATION_RECOVERY_DUPLICATE",
        "Recover an escalation bill once per bill.",
        index,
      );
    seen.add(id);
    if (deduction.amount > found.balance)
      throw recoveryField(
        "BILL_ESCALATION_RECOVERY_OVER_BALANCE",
        `At most ₹${rupees(found.balance)} is left to recover on ${found.number ?? "that escalation bill"}.`,
        index,
        { max: Number(found.balance) },
      );
  });
}
