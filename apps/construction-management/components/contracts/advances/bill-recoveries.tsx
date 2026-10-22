"use client";

import { Button } from "@repo/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";

import { formatPaise } from "@/components/money/money-input";
import {
  ADVANCE_KIND_LABELS,
  type AdvanceKind,
  type DeductionKind,
} from "@/src/contracts/domain/contract-terms";

/** An advance of the bill's contract as the bill shows it (CM-1108). */
export type BillAdvance = {
  id: string;
  kind: AdvanceKind;
  recoveryKind: DeductionKind;
  advanceOn: string;
  amount: number | null;
  recoveryMode: "percent" | "fixed";
  recoveryPercent: string | null;
  recoveryAmount: number | null;
  recovered: number | null;
  balance: number | null;
  suggested: number | null;
};

export const RECOVERY_KINDS: readonly DeductionKind[] = [
  "mobilisation_recovery",
  "secured_advance_recovery",
];

export function isRecoveryKind(kind: string): boolean {
  return (RECOVERY_KINDS as readonly string[]).includes(kind);
}

function dateText(value: string): string {
  return new Date(`${value}T00:00:00.000Z`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

const money = (paise: number | null) =>
  paise == null ? "—" : formatPaise(paise);

/** "Mobilisation advance of 1 Sep 2026 (₹1,00,000.00)". */
export function advanceLabel(advance: BillAdvance): string {
  return `${ADVANCE_KIND_LABELS[advance.kind]} of ${dateText(advance.advanceOn)}${advance.amount == null ? "" : ` (${money(advance.amount)})`}`;
}

/** " — Mobilisation advance of 1 Sep 2026 (…)" for a recovery line, "" otherwise. */
export function recoveredAdvance(
  advances: readonly BillAdvance[],
  advanceId: string | null,
): string {
  if (advanceId == null) return "";
  const advance = advances.find((row) => row.id === advanceId);
  return advance == null ? "" : ` — ${advanceLabel(advance)}`;
}

/** "10% of the gross" or "₹25,000.00 per bill". */
export function recoveryRuleText(advance: BillAdvance): string {
  return advance.recoveryMode === "percent"
    ? `${(advance.recoveryPercent ?? "").replace(/\.?0+$/, "")}% of the gross`
    : `${money(advance.recoveryAmount)} per bill`;
}

/** Picks the advance a recovery deduction recovers, among those of its kind. */
export function AdvanceSelect({
  advances,
  kind,
  value,
  onChange,
  label,
  invalid,
}: {
  advances: readonly BillAdvance[];
  kind: string;
  value: string;
  onChange: (value: string) => void;
  label: string;
  invalid?: boolean;
}) {
  const options = advances
    .filter((advance) => advance.recoveryKind === kind)
    .map((advance) => ({ value: advance.id, label: advanceLabel(advance) }));
  return (
    <Select
      items={options}
      value={value === "" ? null : value}
      onValueChange={(next) => {
        if (next == null) return;
        onChange(next);
      }}
    >
      <SelectTrigger
        aria-label={label}
        aria-invalid={invalid}
        className="w-full min-w-0"
      >
        <SelectValue
          placeholder={
            options.length === 0
              ? "No advance of this kind"
              : "Pick the advance"
          }
        />
      </SelectTrigger>
      <SelectContent align="start" alignItemWithTrigger={false}>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * The advances this bill may recover (CM-1108), each with what is left and
 * what this bill's gross suggests: min(its rule, what is left). "Use"
 * fills or adds that advance's recovery line.
 */
export function RecoverySuggestions({
  advances,
  typed,
  onUse,
}: {
  advances: readonly BillAdvance[];
  typed: readonly { kind: string; advanceId: string }[];
  onUse: (advance: BillAdvance) => void;
}) {
  if (advances.length === 0) return null;
  return (
    <section
      aria-labelledby="bill-recoveries-title"
      className="bg-muted/40 min-w-0 space-y-2 rounded-lg border p-3"
    >
      <h5 id="bill-recoveries-title" className="text-sm font-semibold">
        Advance recoveries
      </h5>
      <ul className="space-y-2">
        {advances.map((advance) => {
          const onBill = typed.some(
            (row) => isRecoveryKind(row.kind) && row.advanceId === advance.id,
          );
          const suggested = advance.suggested ?? 0;
          return (
            <li
              key={advance.id}
              className="flex min-w-0 flex-wrap items-center justify-between gap-2 text-sm"
            >
              <div className="min-w-0">
                <p className="font-medium break-words">
                  {advanceLabel(advance)}
                </p>
                <p className="text-muted-foreground text-xs">
                  {recoveryRuleText(advance)} · {money(advance.balance)} left ·
                  suggested {money(advance.suggested)}
                  {onBill ? " · on this bill" : ""}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={suggested <= 0}
                onClick={() => {
                  onUse(advance);
                }}
              >
                Use {money(advance.suggested)}
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
