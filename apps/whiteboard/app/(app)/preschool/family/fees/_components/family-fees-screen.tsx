"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@repo/ui/components/badge";
import { cn } from "@repo/ui/lib/utils";

import { shortDate } from "@/app/(app)/preschool/family/_components/family-format";
import { FamilyPage } from "@/app/(app)/preschool/family/_components/family-page";
import { formatPaiseAsRupees } from "@/lib/money";
import {
  FEE_PAYMENT_METHOD_LABEL,
  INVOICE_STATUS_LABEL,
  INVOICE_STATUS_VARIANT,
} from "@/lib/preschool-fees";
import type { MeChildView } from "@/src/preschool/application/me";
import { childFeeAccountQueryOptions } from "@/src/queries/preschool/fees";

function Total({
  label,
  paise,
  tone,
}: {
  label: string;
  paise: number;
  tone?: "amber";
}) {
  return (
    <div className="min-w-0 rounded-xl border p-3">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd
        className={cn(
          "text-lg font-semibold tabular-nums",
          tone === "amber" && paise > 0 && "text-amber-800 dark:text-amber-300",
        )}
      >
        {formatPaiseAsRupees(paise)}
      </dd>
    </div>
  );
}

function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums">{children}</dd>
    </div>
  );
}

function Account({
  child,
  childQuery,
}: {
  child: MeChildView;
  childQuery: string;
}) {
  const { data } = useSuspenseQuery(childFeeAccountQueryOptions(child.id));
  const invoices = data.invoices.filter(
    (invoice) => invoice.status !== "cancelled",
  );
  return (
    <div className="space-y-6">
      <dl aria-label="Totals" className="grid grid-cols-3 gap-2">
        <Total label="Fees due" paise={data.totals.duePaise} />
        <Total label="Overdue" paise={data.totals.overduePaise} tone="amber" />
        <Total label="Paid" paise={data.totals.paidPaise} />
      </dl>
      <p className="bg-muted/50 rounded-xl p-3 text-sm">
        Fees are paid at the Centre. Ask for a Receipt for every payment.
      </p>
      <section aria-labelledby="fees-heading" className="space-y-3">
        <h2 id="fees-heading" className="text-lg font-semibold">
          Fees
        </h2>
        {invoices.length === 0 ? (
          <p className="text-muted-foreground text-sm">No fees yet.</p>
        ) : (
          <ul className="space-y-2">
            {invoices.map((invoice) => (
              <li
                key={invoice.id}
                className="bg-card space-y-2 rounded-xl border p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{invoice.label}</p>
                    <p className="text-muted-foreground text-xs">
                      Due {shortDate(invoice.dueOn)}
                    </p>
                  </div>
                  <Badge variant={INVOICE_STATUS_VARIANT[invoice.status]}>
                    {INVOICE_STATUS_LABEL[invoice.status]}
                  </Badge>
                </div>
                <dl className="space-y-0.5 text-sm">
                  <Line label="Amount">
                    {formatPaiseAsRupees(invoice.amountPaise)}
                  </Line>
                  {invoice.concessionPaise > 0 ? (
                    <Line label="Concession">
                      − {formatPaiseAsRupees(invoice.concessionPaise)}
                    </Line>
                  ) : null}
                  {invoice.paidPaise > 0 ? (
                    <Line label="Paid">
                      {formatPaiseAsRupees(invoice.paidPaise)}
                    </Line>
                  ) : null}
                  <Line label="Still due">
                    <span className="font-semibold">
                      {formatPaiseAsRupees(invoice.duePaise)}
                    </span>
                  </Line>
                </dl>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="payments-heading" className="space-y-3">
        <h2 id="payments-heading" className="text-lg font-semibold">
          Payments
        </h2>
        {data.payments.length === 0 ? (
          <p className="text-muted-foreground text-sm">No payments yet.</p>
        ) : (
          <ul className="divide-y rounded-xl border">
            {data.payments.map((payment) => (
              <li key={payment.id}>
                <Link
                  href={`/preschool/family/receipts/${payment.id}${childQuery}`}
                  aria-label={`Receipt ${payment.receiptNumber}, ${formatPaiseAsRupees(payment.amountPaise)} on ${shortDate(payment.receivedOn)}${payment.cancelled ? ", cancelled" : ""}`}
                  className="hover:bg-muted/60 focus-visible:ring-ring/50 flex min-h-14 items-center gap-3 px-3 py-2 outline-none focus-visible:ring-3"
                >
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block font-medium tabular-nums",
                        payment.cancelled &&
                          "text-muted-foreground line-through",
                      )}
                    >
                      {formatPaiseAsRupees(payment.amountPaise)}
                    </span>
                    <span className="text-muted-foreground block text-xs">
                      {shortDate(payment.receivedOn)} ·{" "}
                      {FEE_PAYMENT_METHOD_LABEL[payment.method]} · Receipt{" "}
                      {payment.receiptNumber}
                    </span>
                  </span>
                  {payment.cancelled ? (
                    <Badge variant="destructive">Cancelled</Badge>
                  ) : null}
                  <ChevronRight
                    aria-hidden="true"
                    className="text-muted-foreground size-5"
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** A Child's fees and Receipts, read only (Parent). */
export function FamilyFeesScreen() {
  return (
    <FamilyPage title={(child) => `${child.firstName}'s fees`}>
      {(child, childQuery) => (
        <Account key={child.id} child={child} childQuery={childQuery} />
      )}
    </FamilyPage>
  );
}
