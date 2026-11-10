import { Badge } from "@repo/ui/components/badge";

import type { Invoice } from "@/src/queries/finance-parties";

import { INVOICE_STATUS_LABELS } from "./party-money";

/** Open, Partly paid, Paid or Settled, with Overdue and Variance beside (CM-0017 §7, §13). */
export function InvoiceStatusChips({
  invoice,
}: {
  invoice: Pick<
    Invoice,
    "status" | "overdue" | "daysOverdue" | "variance" | "pendingSettlement"
  >;
}) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      <InvoiceStatusBadge status={invoice.status} />
      {invoice.overdue && (
        <Badge variant="destructive">
          Overdue {invoice.daysOverdue}{" "}
          {invoice.daysOverdue === 1 ? "day" : "days"}
        </Badge>
      )}
      {invoice.variance && (
        <Badge
          variant="outline"
          className="border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
        >
          Variance
        </Badge>
      )}
      {invoice.pendingSettlement != null && (
        <Badge variant="outline">Settlement pending</Badge>
      )}
    </span>
  );
}

export function InvoiceStatusBadge({ status }: { status: Invoice["status"] }) {
  switch (status) {
    case "paid":
      return (
        <Badge
          variant="outline"
          className="border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
        >
          {INVOICE_STATUS_LABELS.paid}
        </Badge>
      );
    case "settled":
      return <Badge variant="secondary">{INVOICE_STATUS_LABELS.settled}</Badge>;
    case "partly_paid":
      return (
        <Badge
          variant="outline"
          className="border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200"
        >
          {INVOICE_STATUS_LABELS.partly_paid}
        </Badge>
      );
    default:
      return <Badge variant="outline">{INVOICE_STATUS_LABELS.open}</Badge>;
  }
}
