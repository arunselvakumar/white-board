"use client";

import { Button } from "@repo/ui/components/button";

import { formatPaise } from "@/components/money/money-input";

/** A negative escalation bill a running bill may recover (CM-1109). */
export type BillEscalationRecovery = {
  escalationBillId: string;
  number: string | null;
  periodFrom: string;
  periodTo: string;
  amount: number | null;
  recovered: number | null;
  balance: number | null;
  reason: string;
};

const money = (paise: number | null) =>
  paise == null ? "—" : formatPaise(paise);

/**
 * The contract's negative escalation bills still to recover (CM-1109):
 * when the indices fell, the escalation comes back as an "other"
 * deduction naming it. "Use" fills or adds that line.
 */
export function EscalationRecoverySuggestions({
  recoveries,
  typed,
  onUse,
}: {
  recoveries: readonly BillEscalationRecovery[];
  typed: readonly { kind: string; escalationBillId: string }[];
  onUse: (recovery: BillEscalationRecovery) => void;
}) {
  if (recoveries.length === 0) return null;
  return (
    <section
      aria-labelledby="bill-escalation-recoveries-title"
      className="bg-muted/40 min-w-0 space-y-2 rounded-lg border p-3"
    >
      <h5
        id="bill-escalation-recoveries-title"
        className="text-sm font-semibold"
      >
        Escalation recoveries
      </h5>
      <ul className="space-y-2">
        {recoveries.map((row) => {
          const onBill = typed.some(
            (line) =>
              line.kind === "other" &&
              line.escalationBillId === row.escalationBillId,
          );
          return (
            <li
              key={row.escalationBillId}
              className="flex min-w-0 flex-wrap items-center justify-between gap-2 text-sm"
            >
              <div className="min-w-0">
                <p className="font-medium break-words">{row.reason}</p>
                <p className="text-muted-foreground text-xs">
                  {money(row.amount)} fell · {money(row.balance)} left
                  {onBill ? " · on this bill" : ""}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={(row.balance ?? 0) <= 0}
                onClick={() => {
                  onUse(row);
                }}
              >
                Use {money(row.balance)}
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
