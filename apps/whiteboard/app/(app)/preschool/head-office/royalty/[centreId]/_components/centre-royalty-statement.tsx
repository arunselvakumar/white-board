"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { Button } from "@repo/ui/components/button";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { TableCard } from "@/app/(app)/preschool/_components/table-card";

import {
  MonthStepper,
  formatMonth,
  useReportMonth,
} from "@/app/(app)/preschool/head-office/_components/month-stepper";
import { PreschoolPage } from "@/app/(app)/preschool/_components/preschool-page";
import { formatPaiseAsRupees } from "@/lib/money";
import { preschoolCentreRoyaltyQueryOptions } from "@/src/queries/preschool/royalty";

/** The statement prints on its own page, without the app around it. */
const PRINT_CSS = `
@page { size: A4 portrait; margin: 14mm; }
@media print {
  [data-slot="sidebar"],
  [data-slot="sidebar-gap"],
  [data-slot="sidebar-container"] { display: none !important; }
  [data-slot="sidebar-wrapper"] { display: block !important; min-height: 0 !important; }
  [data-slot="sidebar-inset"] { margin: 0 !important; border: 0 !important; box-shadow: none !important; }
  html, body { background: #fff !important; }
  .royalty-statement { font-size: 10pt; }
  .royalty-statement [data-slot="table-container"] { overflow: visible !important; }
}
`;

/** "5 Nov 2026" */
function formatDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

const HEAD = "text-xs tracking-wide uppercase";

/** One Franchised Centre's Royalty Statement for a month, ready to print. */
export function CentreRoyaltyStatement({ centreId }: { centreId: string }) {
  const { month, current, setMonth } = useReportMonth();
  const { data } = useSuspenseQuery(
    preschoolCentreRoyaltyQueryOptions(centreId, month),
  );

  return (
    <PreschoolPage
      title={`${data.name} · Royalty`}
      watermark="Royalty"
      meta={null}
      width="form"
      back={{
        href: `/preschool/head-office/royalty${month === current ? "" : `?month=${month}`}`,
        label: "Royalty Statement",
      }}
      actions={
        <>
          <MonthStepper month={month} current={current} onChange={setMonth} />
          <Button
            type="button"
            variant="outline"
            className="h-11 print:hidden"
            onClick={() => {
              window.print();
            }}
          >
            <Printer aria-hidden="true" />
            Print
          </Button>
        </>
      }
    >
      <style>{PRINT_CSS}</style>
      <article
        aria-label="Royalty Statement"
        className="royalty-statement space-y-5"
      >
        <header className="grid gap-3 rounded-xl border p-4 text-sm sm:grid-cols-3">
          <div>
            <p className="text-muted-foreground text-xs">Centre</p>
            <p className="font-medium">
              {data.name} ({data.code})
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Franchisee</p>
            <p className="font-medium">
              {data.franchiseeName ?? "Not recorded"}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Month · Royalty</p>
            <p className="font-medium">
              {formatMonth(month)} · {data.royaltyPercent}%
            </p>
          </div>
        </header>
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={`pl-4 ${HEAD}`}>Receipt</TableHead>
                <TableHead className={HEAD}>Date</TableHead>
                <TableHead className={HEAD}>Child</TableHead>
                <TableHead className={`text-right ${HEAD}`}>
                  Royalty-bearing
                </TableHead>
                <TableHead className={`pr-4 text-right ${HEAD}`}>
                  Other
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.payments.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-muted-foreground py-6 text-center"
                  >
                    No Fee Payments were received in {formatMonth(month)}.
                  </TableCell>
                </TableRow>
              ) : (
                data.payments.map((payment) => (
                  <TableRow key={payment.paymentId}>
                    <TableCell className="pl-4 tabular-nums">
                      {payment.receiptNumber}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatDate(payment.receivedOn)}
                    </TableCell>
                    <TableCell>{payment.childName}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPaiseAsRupees(payment.royaltyBearingPaise)}
                    </TableCell>
                    <TableCell className="pr-4 text-right tabular-nums">
                      {formatPaiseAsRupees(payment.otherPaise)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={3} className="pl-4 font-medium">
                  Total
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {formatPaiseAsRupees(data.royaltyBearingPaise)}
                </TableCell>
                <TableCell className="pr-4 text-right font-medium tabular-nums">
                  {formatPaiseAsRupees(data.otherPaise)}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </TableCard>
        <p className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border p-4">
          <span>
            Royalty due: {data.royaltyPercent}% of{" "}
            {formatPaiseAsRupees(data.royaltyBearingPaise)}
          </span>
          <span className="text-2xl font-semibold tabular-nums">
            {formatPaiseAsRupees(data.royaltyPaise)}
          </span>
        </p>
        <p className="text-muted-foreground text-xs">
          Computed from Fee Payments received in {formatMonth(month)}. This is a
          statement, not an invoice.
        </p>
      </article>
    </PreschoolPage>
  );
}
