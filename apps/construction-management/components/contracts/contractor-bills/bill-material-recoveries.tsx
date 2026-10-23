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

/** A Work Order material as a bill offers it (CM-1110). */
export type BillMaterial = {
  materialId: string;
  materialName: string;
  uomName: string;
  issueBasis: "free" | "at_cost";
  excess: string;
  penalRate: number | null;
  recoveredBefore: number | null;
  recoverySuggested: number | null;
  recoveryFits: number | null;
  atCostDeductedBefore: number | null;
  atCostSuggested: number | null;
  atCostFits: number | null;
};

const money = (paise: number | null) =>
  paise == null ? "—" : formatPaise(paise);

/** `"53.320"` → `"53.32"`. */
const quantity = (value: string) =>
  value.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");

export function isMaterialKind(kind: string): boolean {
  return kind === "material_reconciliation" || kind === "material_at_cost";
}

/** The material a material deduction recovers: the Work Order's ones (at cost only for at cost). */
export function MaterialSelect({
  materials,
  kind,
  value,
  onChange,
  label,
  invalid,
}: {
  materials: readonly BillMaterial[];
  kind: string;
  value: string;
  onChange: (value: string) => void;
  label: string;
  invalid?: boolean;
}) {
  const options = materials
    .filter(
      (row) => kind !== "material_at_cost" || row.issueBasis === "at_cost",
    )
    .map((row) => ({ value: row.materialId, label: row.materialName }));
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
        aria-required={kind === "material_reconciliation"}
        className="w-full min-w-0"
      >
        <SelectValue
          placeholder={
            options.length === 0 ? "No material issued" : "Pick the material"
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
 * What the Work Order's material reconciliation suggests for this bill
 * (CM-1110): per material the recovery at the penal rate on the excess,
 * and material issued at cost not yet deducted. Each is due in full but
 * offered only up to what fits the bill as typed (gross + GST payable less
 * the other deductions); the rest stays due for later bills. "Use" fills
 * or adds that line; more than the suggestion needs a reason and Approve.
 */
export function MaterialRecoverySuggestions({
  materials,
  typed,
  onUse,
  roomFor,
  reconciliationHref,
}: {
  materials: readonly BillMaterial[];
  typed: readonly { kind: string; materialId: string }[];
  onUse: (
    kind: "material_reconciliation" | "material_at_cost",
    material: BillMaterial,
  ) => void;
  /** Paise left on the bill for this line, as typed. */
  roomFor: (
    kind: "material_reconciliation" | "material_at_cost",
    materialId: string,
  ) => number;
  reconciliationHref: string;
}) {
  const rows = materials.flatMap((row) => [
    ...((row.recoverySuggested ?? 0) > 0 || Number(row.excess) > 0
      ? [{ kind: "material_reconciliation" as const, row }]
      : []),
    ...((row.atCostSuggested ?? 0) > 0
      ? [{ kind: "material_at_cost" as const, row }]
      : []),
  ]);
  if (materials.length === 0) return null;
  return (
    <section
      aria-labelledby="bill-material-recoveries-title"
      className="bg-muted/40 min-w-0 space-y-2 rounded-lg border p-3"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h5
          id="bill-material-recoveries-title"
          className="text-sm font-semibold"
        >
          Material recoveries
        </h5>
        <a className="text-sm underline" href={reconciliationHref}>
          Material reconciliation
        </a>
      </div>
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          No excess over the allowed wastage and nothing issued at cost to
          deduct.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map(({ kind, row }) => {
            const due =
              (kind === "material_reconciliation"
                ? row.recoverySuggested
                : row.atCostSuggested) ?? 0;
            const amount = Math.max(
              0,
              Math.min(due, roomFor(kind, row.materialId)),
            );
            const onBill = typed.some(
              (line) =>
                line.kind === kind && line.materialId === row.materialId,
            );
            return (
              <li
                key={`${kind}:${row.materialId}`}
                className="flex min-w-0 flex-wrap items-center justify-between gap-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium break-words">{row.materialName}</p>
                  <p className="text-muted-foreground text-xs">
                    {kind === "material_reconciliation"
                      ? `Excess ${quantity(row.excess)} ${row.uomName} at ${money(row.penalRate)} · ${money(row.recoveredBefore)} recovered before`
                      : `Issued at cost · ${money(row.atCostDeductedBefore)} deducted before`}
                    {onBill ? " · on this bill" : ""}
                  </p>
                  {amount < due ? (
                    <p className="text-xs text-amber-700">
                      {money(due)} due · {money(amount)} fits this bill
                    </p>
                  ) : null}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={amount <= 0}
                  onClick={() => {
                    onUse(kind, row);
                  }}
                >
                  Use {money(amount)}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
