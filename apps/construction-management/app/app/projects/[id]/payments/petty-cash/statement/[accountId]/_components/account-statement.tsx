"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { Suspense, useId, useState, useTransition } from "react";
import { Badge } from "@repo/ui/components/badge";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
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

import { formatPaise } from "@/components/money/money-input";
import { formatDate, localToday } from "@/components/payments/payment-format";
import { SiteRecordHeader } from "@/components/site-work/site-record-header";
import {
  accountStatementQuery,
  pettyCashAccountsQuery,
  type AccountStatement,
} from "@/src/queries/finance-petty-cash";

import { Amount, pettyCashPath } from "./petty-cash-parts";
import {
  STATEMENT_COLUMNS,
  StatementLinesSkeleton,
} from "./petty-cash-skeletons";

type Entry = AccountStatement["entries"][number];

const KIND_LABELS: Record<Entry["kind"], string> = {
  opening: "Opening balance",
  receipt: "Receipt",
  payment: "Payment",
  transfer_in: "Transfer in",
  transfer_out: "Transfer out",
};

function particulars(entry: Entry): string {
  return (
    [entry.counterpartyName, entry.narration, entry.paymentCategoryName]
      .filter((part) => part != null && part !== "")
      .join(" · ") || KIND_LABELS[entry.kind]
  );
}

function money(paise: number): string {
  return paise === 0 ? "" : formatPaise(Math.abs(paise));
}

function Lines({
  accountId,
  from,
  to,
}: {
  accountId: string;
  from: string;
  to: string;
}) {
  const { data } = useSuspenseQuery(accountStatementQuery(accountId, from, to));
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Opening", data.opening],
          ["Money in", data.totalIn],
          ["Money out", -data.totalOut],
          ["Closing", data.closing],
        ].map(([label, value]) => (
          <div key={label} className="bg-card rounded-lg border p-3">
            <dt className="text-muted-foreground text-xs">{label}</dt>
            <dd className="font-semibold">
              <Amount paise={Number(value)} />
            </dd>
          </div>
        ))}
      </dl>
      {data.entries.length === 0 ? (
        <p className="bg-card text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
          No entries between {formatDate(from)} and {formatDate(to)}. Pending
          vouchers show once approved.
        </p>
      ) : (
        <>
          <div className="bg-card hidden overflow-x-auto rounded-lg border md:block">
            <Table aria-label="Statement">
              <TableHeader>
                <TableRow>
                  {STATEMENT_COLUMNS.map((column, index) => (
                    <TableHead key={index} className={column.className}>
                      {column.header}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell>{formatDate(from)}</TableCell>
                  <TableCell />
                  <TableCell className="font-medium">Opening balance</TableCell>
                  <TableCell />
                  <TableCell />
                  <TableCell className="text-right">
                    <Amount paise={data.opening} />
                  </TableCell>
                </TableRow>
                {data.entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="whitespace-nowrap">
                      {formatDate(entry.entryDate)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {entry.documentNumber ?? KIND_LABELS[entry.kind]}
                      {entry.isReversal ? (
                        <Badge variant="outline" className="ml-2">
                          Reversal
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="max-w-72 truncate">
                      {particulars(entry)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {entry.amount > 0 ? money(entry.amount) : ""}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {entry.amount < 0 ? money(entry.amount) : ""}
                    </TableCell>
                    <TableCell className="text-right">
                      <Amount paise={entry.balance} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={3}>Closing balance</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPaise(data.totalIn)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPaise(data.totalOut)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Amount paise={data.closing} />
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
          <ul aria-label="Statement" className="space-y-2 md:hidden">
            {data.entries.map((entry) => (
              <li key={entry.id} className="bg-card rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {entry.documentNumber ?? KIND_LABELS[entry.kind]}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {formatDate(entry.entryDate)}
                      {entry.isReversal ? " · Reversal" : ""}
                    </p>
                  </div>
                  <Amount paise={entry.amount} signed />
                </div>
                <p className="mt-1 truncate text-sm">{particulars(entry)}</p>
                <p className="text-muted-foreground text-xs">
                  Balance <Amount paise={entry.balance} />
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/**
 * A petty-cash account's statement for a period (CM-703): the opening
 * balance, each approved entry with its running balance, money in and out,
 * and the closing balance. Reversals (an approved voucher edited or
 * deleted) show as their own lines.
 */
export function AccountStatementView({
  projectId,
  accountId,
  today = localToday(),
}: {
  projectId: string;
  accountId: string;
  today?: string;
}) {
  const id = useId();
  const { data: accounts } = useSuspenseQuery(pettyCashAccountsQuery());
  const account = accounts.items.find((item) => item.id === accountId);
  const [range, setRange] = useState({
    from: `${today.slice(0, 8)}01`,
    to: today,
  });
  const [updating, startTransition] = useTransition();
  const valid = range.from !== "" && range.to !== "" && range.from <= range.to;
  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <SiteRecordHeader
        back={{
          label: "Petty Cash",
          href: pettyCashPath(
            projectId,
            `?account=${encodeURIComponent(accountId)}`,
          ),
        }}
        title={`Statement · ${account?.name ?? "Petty cash"}`}
        size="detail"
        meta={account == null ? undefined : `Held by ${account.holderName}`}
      />
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor={`${id}-from`} className="text-xs">
            From
          </Label>
          <Input
            id={`${id}-from`}
            type="date"
            className="w-40"
            value={range.from}
            onChange={(event) => {
              const from = event.target.value;
              startTransition(() => {
                setRange((current) => ({ ...current, from }));
              });
            }}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${id}-to`} className="text-xs">
            To
          </Label>
          <Input
            id={`${id}-to`}
            type="date"
            className="w-40"
            value={range.to}
            onChange={(event) => {
              const to = event.target.value;
              startTransition(() => {
                setRange((current) => ({ ...current, to }));
              });
            }}
          />
        </div>
      </div>
      {valid ? (
        <div className={cn(updating && "opacity-60 transition-opacity")}>
          <Suspense fallback={<StatementLinesSkeleton />}>
            <Lines accountId={accountId} from={range.from} to={range.to} />
          </Suspense>
        </div>
      ) : (
        <p className="text-destructive text-sm">
          Choose a From date on or before the To date.
        </p>
      )}
    </div>
  );
}
