"use client";

import { ReceiptIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { EmptyState } from "@repo/ui/components/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";

import { formatPaiseAsRupees } from "@/lib/money";
import { FEE_PAYMENT_METHOD_LABEL, feeDateLabel } from "@/lib/preschool-fees";
import type { PreschoolFeePaymentList } from "@/src/queries/preschool/fees";

/** One page of a Centre's Fee Payments, with the range's count and sum. */
export function PaymentsTable({ page }: { page: PreschoolFeePaymentList }) {
  if (page.total === 0)
    return (
      <EmptyState
        className="border"
        size="md"
        icon={ReceiptIcon}
        tone="green"
        title="No payments in these dates"
        description="Fee Payments recorded between these dates show here with their Receipts."
      />
    );
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Receipt</TableHead>
          <TableHead>Date</TableHead>
          <TableHead>Child</TableHead>
          <TableHead>Method</TableHead>
          <TableHead className="text-right">Amount</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {page.items.map((payment) => (
          <TableRow key={payment.id}>
            <TableCell>
              <Link
                href={`/preschool/fees/receipts/${payment.id}`}
                className="font-medium tabular-nums hover:underline"
              >
                {payment.receiptNumber}
              </Link>
            </TableCell>
            <TableCell className="whitespace-nowrap">
              {feeDateLabel(payment.receivedOn)}
            </TableCell>
            <TableCell>
              <Link
                href={`/preschool/fees/children/${payment.childId}`}
                className="hover:underline"
              >
                {payment.childName}
              </Link>
              <div className="text-muted-foreground text-xs">
                {payment.admissionNumber}
              </div>
            </TableCell>
            <TableCell>
              {FEE_PAYMENT_METHOD_LABEL[payment.method]}
              {payment.reference == null ? null : (
                <div className="text-muted-foreground text-xs">
                  {payment.reference}
                </div>
              )}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatPaiseAsRupees(payment.amountPaise)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell colSpan={4}>
            {page.total} {page.total === 1 ? "payment" : "payments"} in these
            dates
          </TableCell>
          <TableCell className="text-right font-semibold tabular-nums">
            {formatPaiseAsRupees(page.totalPaise)}
          </TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}
