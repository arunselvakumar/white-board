"use client";

import { Button } from "@repo/ui/components/button";

import {
  isRupees,
  MoneyInput,
  paiseToRupees,
  rupeesToPaise,
} from "@/components/money/money-input";
import type { Invoice } from "@/src/queries/finance-parties";

import { formatDate, money } from "./party-money";
import { InvoiceStatusChips } from "./party-status";

/** Rupees typed per invoice id. */
export type AllocationValues = Record<string, string>;

/** Paise allocated per invoice (blank and invalid rows left out). */
export function allocationsOf(
  values: AllocationValues,
): { invoiceId: string; amount: number }[] {
  return Object.entries(values).flatMap(([invoiceId, text]) => {
    if (!isRupees(text)) return [];
    const amount = rupeesToPaise(text) ?? 0;
    return amount > 0 ? [{ invoiceId, amount }] : [];
  });
}

export function allocatedTotal(values: AllocationValues): number {
  return allocationsOf(values).reduce((sum, row) => sum + row.amount, 0);
}

/** Spreads `available` paise over the invoices in order (oldest due first). */
export function fillAllocations(
  invoices: readonly Pick<Invoice, "id" | "balance">[],
  available: number,
): AllocationValues {
  let left = available;
  const values: AllocationValues = {};
  for (const invoice of invoices) {
    const take = Math.min(left, invoice.balance);
    values[invoice.id] = take > 0 ? paiseToRupees(take) : "";
    left -= Math.max(take, 0);
  }
  return values;
}

/**
 * The open invoices a payment settles, oldest due first (CM-0017 §7): one
 * amount per invoice, at most its balance, and **Fill** to spread the
 * settled amount in order. What is left is an advance.
 */
export function AllocationTable({
  invoices,
  values,
  onChange,
  available,
  idPrefix = "allocation",
}: {
  invoices: readonly Invoice[];
  values: AllocationValues;
  onChange: (values: AllocationValues) => void;
  /** Paise this payment can allocate; null hides Fill. */
  available: number | null;
  idPrefix?: string;
}) {
  if (invoices.length === 0)
    return (
      <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">
        No open invoices. The whole payment is an advance; apply it to a later
        invoice from the payment.
      </p>
    );
  return (
    <div className="space-y-2">
      {available != null && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-muted-foreground text-sm">
            Oldest due first. Amounts settle each invoice.
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                onChange(fillAllocations(invoices, available));
              }}
            >
              Fill
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                onChange({});
              }}
            >
              Clear
            </Button>
          </div>
        </div>
      )}
      <ul aria-label="Open invoices" className="divide-y rounded-lg border">
        {invoices.map((invoice) => {
          const text = values[invoice.id] ?? "";
          const paise = isRupees(text) ? (rupeesToPaise(text) ?? 0) : 0;
          const over = paise > invoice.balance;
          const invalid = text.trim() !== "" && !isRupees(text);
          const inputId = `${idPrefix}-${invoice.id}`;
          return (
            <li
              key={invoice.id}
              className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 space-y-0.5">
                <label htmlFor={inputId} className="block font-medium">
                  {invoice.invoiceNumber}
                </label>
                <p className="text-muted-foreground text-xs">
                  {formatDate(invoice.invoiceDate)}
                  {invoice.dueDate != null &&
                    ` · due ${formatDate(invoice.dueDate)}`}{" "}
                  · balance {money(invoice.balance)}
                </p>
                <InvoiceStatusChips invoice={invoice} />
              </div>
              <div className="w-full shrink-0 space-y-1 sm:w-44">
                <MoneyInput
                  id={inputId}
                  className="h-10"
                  value={text}
                  placeholder="0"
                  aria-invalid={over || invalid}
                  onChange={(event) => {
                    onChange({ ...values, [invoice.id]: event.target.value });
                  }}
                />
                {over && (
                  <p className="text-destructive text-xs">
                    More than the balance
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
