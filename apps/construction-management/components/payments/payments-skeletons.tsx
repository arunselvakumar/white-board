import { Skeleton } from "@repo/ui/components/skeleton";
import {
  FormSkeleton,
  SkeletonGroup,
  SkeletonText,
  type SkeletonColumn,
} from "@repo/ui/components/skeleton-kit";

import {
  ResponsiveListSkeleton,
  srOnly,
} from "@/components/finance/finance-skeletons";

/*
 * Wages payments while they load (ADR-0047): real column headers and
 * field labels; bars where the figures go.
 *
 * `SkeletonGroup` wraps its bars in a `display: contents` box, so spacing
 * between them uses flex `gap`, which reaches through it; `space-y` doesn't.
 */

export const BALANCE_FIGURES = [
  { key: "previousBalance", label: "Previous Balance" },
  { key: "toPay", label: "To Pay" },
  { key: "advance", label: "Advance" },
  { key: "paid", label: "Paid" },
  { key: "finalAmount", label: "Final Amount" },
] as const;

const BALANCE_COLUMNS: SkeletonColumn[] = [
  { header: "Name" },
  ...BALANCE_FIGURES.map((figure): SkeletonColumn => ({
    header: figure.label,
    kind: "number",
    className: "text-right",
  })),
  { header: srOnly("Actions"), kind: "actions", className: "w-20" },
];

export const PAYMENT_COLUMNS: SkeletonColumn[] = [
  { header: "Date", kind: "muted" },
  { header: "Paid to" },
  { header: "Kind", kind: "badge" },
  { header: "Mode", kind: "muted" },
  { header: "Paid from", kind: "muted" },
  { header: "Paid by", kind: "muted" },
  { header: "Amount", kind: "number", className: "text-right" },
  { header: srOnly("Actions"), kind: "actions", className: "w-32" },
];

/** Labour or Vendor balances for the period. */
export function BalancesSkeleton({ noun }: { noun: string }) {
  return (
    <ResponsiveListSkeleton
      label={`Loading ${noun}`}
      count
      columns={BALANCE_COLUMNS}
    />
  );
}

/** Recorded payments under the real filters. */
export function PaymentRowsSkeleton() {
  return (
    <ResponsiveListSkeleton
      label="Loading payments"
      count
      columns={PAYMENT_COLUMNS}
    />
  );
}

/** A party's statement in the sheet: the balances card, then the entries. */
export function StatementLinesSkeleton() {
  return (
    <SkeletonGroup
      label="Loading the statement"
      className="flex flex-col gap-3"
    >
      <dl className="grid grid-cols-2 gap-2 rounded-lg border p-3 text-sm">
        <div>
          <dt className="text-muted-foreground">Previous Balance</dt>
          <dd>
            <SkeletonText width="5rem" />
          </dd>
        </div>
        <div className="text-right">
          <dt className="text-muted-foreground">Closing balance</dt>
          <dd className="flex justify-end">
            <SkeletonText width="5rem" />
          </dd>
        </div>
      </dl>
      <ol className="space-y-2">
        {["62%", "48%", "70%"].map((width, row) => (
          <li key={row} className="rounded-lg border p-3">
            <div className="flex items-start justify-between gap-3">
              <SkeletonText width={width} />
              <SkeletonText width="4.5rem" />
            </div>
            <SkeletonText size="xs" width="40%" />
          </li>
        ))}
      </ol>
    </SkeletonGroup>
  );
}

/** The Pay form while its accounts and members load. */
export function PayFormSkeleton() {
  return (
    <SkeletonGroup
      label="Loading the payment form"
      className="flex flex-col gap-4"
    >
      <FormSkeleton
        columns={2}
        actions={0}
        fields={[
          { label: "Payment date" },
          { label: "Amount" },
          { label: "Type" },
          { label: "Mode" },
          { label: "Paid from", control: "select", wide: true },
        ]}
      />
      <div className="flex justify-end gap-2">
        <Skeleton className="h-9 w-20 rounded-md" />
        <Skeleton className="h-9 w-24 rounded-md" />
      </div>
    </SkeletonGroup>
  );
}
