"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { FileText, Wallet } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@repo/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { cn } from "@repo/ui/lib/utils";

import {
  invoicesQuery,
  partyPaymentsQuery,
  partyStatementQuery,
  type PartyType,
} from "@/src/queries/finance-parties";

import {
  ENTRY_KIND_LABELS,
  formatDate,
  MODE_LABELS,
  money,
  partyPaths,
} from "./party-money";
import { InvoiceStatusChips } from "./party-status";

type Cursor = { after?: string; before?: string } | null;

function Pager({
  prev,
  next,
  onPage,
}: {
  prev: string | null;
  next: string | null;
  onPage: (cursor: Cursor) => void;
}) {
  if (prev == null && next == null) return null;
  return (
    <div className="flex justify-end gap-2">
      <Button
        variant="outline"
        size="sm"
        disabled={prev == null}
        onClick={() => {
          if (prev != null) onPage({ before: prev });
        }}
      >
        Newer
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={next == null}
        onClick={() => {
          if (next != null) onPage({ after: next });
        }}
      >
        Older
      </Button>
    </div>
  );
}

/** A party's invoices on the Project, newest first; a row opens the invoice. */
export function PartyInvoices({
  projectId,
  partyType,
  partyId,
  onOpen,
}: {
  projectId: string;
  partyType: PartyType;
  partyId: string;
  onOpen: (invoiceId: string) => void;
}) {
  const [cursor, setCursor] = useState<Cursor>(null);
  const { data } = useSuspenseQuery(
    invoicesQuery(projectId, { partyType, partyId, cursor }),
  );
  if (data.items.length === 0)
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileText />
          </EmptyMedia>
          <EmptyTitle>No invoices yet</EmptyTitle>
          <EmptyDescription>
            Record the party&apos;s bills here; payments settle them.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  return (
    <div className="space-y-3">
      <ul aria-label="Invoices" className="space-y-2">
        {data.items.map((invoice) => (
          <li
            key={invoice.id}
            className="bg-card hover:bg-muted/40 relative rounded-lg border p-3 transition-colors"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <button
                  type="button"
                  className="focus-visible:ring-ring block rounded-sm text-left font-medium outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:ring-2"
                  onClick={() => {
                    onOpen(invoice.id);
                  }}
                >
                  {invoice.invoiceNumber}
                  {invoice.direction === "receivable" && " (sales)"}
                </button>
                <p className="text-muted-foreground text-xs">
                  {formatDate(invoice.invoiceDate)}
                  {invoice.dueDate != null &&
                    ` · due ${formatDate(invoice.dueDate)}`}
                  {invoice.department?.name != null &&
                    ` · ${invoice.department.name}`}
                  {invoice.goodsReceipts.length > 0 &&
                    ` · ${invoice.goodsReceipts.map((grn) => grn.number ?? "GRN").join(", ")}`}
                </p>
                <InvoiceStatusChips invoice={invoice} />
              </div>
              <div className="shrink-0 text-right text-sm">
                <p className="font-semibold tabular-nums">
                  {money(invoice.balance)}
                </p>
                <p className="text-muted-foreground text-xs tabular-nums">
                  of {money(invoice.amount)}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <Pager prev={data.prevCursor} next={data.nextCursor} onPage={setCursor} />
    </div>
  );
}

/** A party's payments on the Project, newest first; a row opens the payment. */
export function PartyPayments({
  projectId,
  partyType,
  partyId,
}: {
  projectId: string;
  partyType: PartyType;
  partyId: string;
}) {
  const [cursor, setCursor] = useState<Cursor>(null);
  const { data } = useSuspenseQuery(
    partyPaymentsQuery(projectId, { partyType, partyId, cursor }),
  );
  const paths = partyPaths(projectId, partyType);
  if (data.items.length === 0)
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Wallet />
          </EmptyMedia>
          <EmptyTitle>No payments yet</EmptyTitle>
          <EmptyDescription>
            Payments to (or from) the party on this Project show here, each with
            its receipt.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  return (
    <div className="space-y-3">
      <ul aria-label="Payments" className="space-y-2">
        {data.items.map((payment) => (
          <li
            key={payment.id}
            className="bg-card hover:bg-muted/40 relative rounded-lg border p-3 transition-colors"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-0.5">
                <Link
                  href={paths.payment(payment.id)}
                  className="focus-visible:ring-ring block rounded-sm font-medium outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:ring-2"
                >
                  {payment.number}
                </Link>
                <p className="text-muted-foreground text-xs">
                  {formatDate(payment.paymentDate)} ·{" "}
                  {MODE_LABELS[payment.mode]} · {payment.account.name ?? "—"}
                  {payment.direction === "in" && " · received"}
                </p>
                {payment.unallocated > 0 && (
                  <p className="text-xs">
                    Advance {money(payment.unallocated)}
                  </p>
                )}
              </div>
              <div className="shrink-0 text-right text-sm">
                <p className="font-semibold tabular-nums">
                  {money(payment.amount)}
                </p>
                {payment.tds != null && payment.tds.amount > 0 && (
                  <p className="text-muted-foreground text-xs tabular-nums">
                    + TDS {money(payment.tds.amount)}
                  </p>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
      <Pager prev={data.prevCursor} next={data.nextCursor} onPage={setCursor} />
    </div>
  );
}

/** A party's statement on the Project: each entry with the running balance (CM-705). */
export function PartyStatementTable({
  projectId,
  partyType,
  partyId,
}: {
  projectId: string;
  partyType: PartyType;
  partyId: string;
}) {
  const { data } = useSuspenseQuery(
    partyStatementQuery(projectId, partyType, partyId),
  );
  if (data.lines.length === 0)
    return (
      <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">
        Nothing on the statement yet.
      </p>
    );
  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-sm">
        + is owed to the party; − is an advance or owed to the Company.
      </p>
      <div className="hidden rounded-lg border md:block">
        <Table aria-label="Statement">
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Entry</TableHead>
              <TableHead>Document</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.lines.map((line) => (
              <TableRow key={line.id}>
                <TableCell>{formatDate(line.entryDate)}</TableCell>
                <TableCell>{ENTRY_KIND_LABELS[line.kind]}</TableCell>
                <TableCell>{line.document.number ?? "—"}</TableCell>
                <TableCell
                  className={cn(
                    "text-right tabular-nums",
                    line.amount < 0 && "text-muted-foreground",
                  )}
                >
                  {money(line.amount)}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {money(line.balance)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={4} className="font-semibold">
                Closing balance
              </TableCell>
              <TableCell className="text-right font-semibold tabular-nums">
                {money(data.closing)}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>
      <ul aria-label="Statement" className="space-y-2 md:hidden">
        {data.lines.map((line) => (
          <li key={line.id} className="rounded-lg border p-3 text-sm">
            <div className="flex justify-between gap-3">
              <span className="min-w-0">
                {ENTRY_KIND_LABELS[line.kind]}
                {line.document.number != null && ` · ${line.document.number}`}
              </span>
              <span className="shrink-0 tabular-nums">
                {money(line.amount)}
              </span>
            </div>
            <div className="text-muted-foreground flex justify-between gap-3 text-xs">
              <span>{formatDate(line.entryDate)}</span>
              <span className="tabular-nums">
                Balance {money(line.balance)}
              </span>
            </div>
          </li>
        ))}
        <li className="bg-muted/40 flex justify-between rounded-lg border p-3 text-sm font-semibold">
          <span>Closing balance</span>
          <span className="tabular-nums">{money(data.closing)}</span>
        </li>
      </ul>
    </div>
  );
}
