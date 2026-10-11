"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { Suspense, useState, useTransition } from "react";
import { Badge } from "@repo/ui/components/badge";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { Skeleton } from "@repo/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";

import {
  PageHeader,
  type PageHeaderBack,
} from "@/components/app-shell/page-header";
import { formatPaise } from "@/components/money/money-input";
import { formatDate } from "@/components/payments/payment-format";
import {
  accountStatementQuery,
  type AccountStatementLine,
} from "@/src/queries/finance-accounts";

import { ACCOUNT_KIND_LABELS, SignedAmount } from "./account-format";

export const ENTRY_SOURCE_LABELS: Record<
  AccountStatementLine["sourceType"],
  string
> = {
  account: "Opening balance",
  transaction: "Transaction",
  account_transfer: "Transfer",
  petty_cash_voucher: "Petty cash voucher",
  other_expense: "Other Expense",
  party_payment: "Party payment",
  wage_payment: "Wage payment",
  salary_slip: "Salary",
};

const MODE_LABELS = {
  cash: "Cash",
  cheque: "Cheque",
  online: "Online",
  upi: "UPI",
} as const;

function particulars(line: AccountStatementLine): string {
  const head = line.documentNumber ?? ENTRY_SOURCE_LABELS[line.sourceType];
  return line.counterpartyName == null
    ? head
    : `${head} · ${line.counterpartyName}`;
}

function modeLine(line: AccountStatementLine): string {
  if (line.mode == null) return "—";
  return line.reference == null
    ? MODE_LABELS[line.mode]
    : `${MODE_LABELS[line.mode]} · ${line.reference}`;
}

function Amount({ paise }: { paise: number }) {
  return paise === 0 ? (
    <span className="text-muted-foreground">—</span>
  ) : (
    <span className="tabular-nums">{formatPaise(paise)}</span>
  );
}

/**
 * An account's Ledger (CM-701): a period (this month by default), the
 * opening, every approved entry with its running balance, money in
 * (credit) and out (debit), and the closing. Reversals show as their own
 * lines. Petty Cash's statement uses it too.
 */
export function AccountLedger({
  accountId,
  back,
}: {
  accountId: string;
  back: PageHeaderBack;
}) {
  const [period, setPeriod] = useState<{ from: string; to: string }>({
    from: "",
    to: "",
  });
  const [, startTransition] = useTransition();
  return (
    <div className="w-full p-6">
      <div className="w-full max-w-5xl space-y-6">
        <Suspense fallback={<LedgerSkeleton />}>
          <LedgerBody
            accountId={accountId}
            back={back}
            period={period}
            onPeriod={(next) => {
              startTransition(() => {
                setPeriod(next);
              });
            }}
          />
        </Suspense>
      </div>
    </div>
  );
}

function LedgerSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

function LedgerBody({
  accountId,
  back,
  period,
  onPeriod,
}: {
  accountId: string;
  back: PageHeaderBack;
  period: { from: string; to: string };
  onPeriod: (period: { from: string; to: string }) => void;
}) {
  const { data } = useSuspenseQuery(accountStatementQuery(accountId, period));
  const kind = ACCOUNT_KIND_LABELS[data.account.kind];
  return (
    <>
      <PageHeader
        back={back}
        title={`${data.account.name} — Ledger`}
        meta={
          data.account.holderName == null
            ? kind
            : `${kind} · ${data.account.holderName}`
        }
      />
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="ledger-from" className="text-xs">
            From
          </Label>
          <Input
            id="ledger-from"
            type="date"
            className="h-9 w-40"
            value={period.from === "" ? data.from : period.from}
            max={data.to}
            onChange={(event) => {
              if (event.target.value !== "")
                onPeriod({
                  from: event.target.value,
                  to: period.to === "" ? data.to : period.to,
                });
            }}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ledger-to" className="text-xs">
            To
          </Label>
          <Input
            id="ledger-to"
            type="date"
            className="h-9 w-40"
            value={period.to === "" ? data.to : period.to}
            min={data.from}
            onChange={(event) => {
              if (event.target.value !== "")
                onPeriod({
                  from: period.from === "" ? data.from : period.from,
                  to: event.target.value,
                });
            }}
          />
        </div>
      </div>
      <section aria-label="Summary">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(
            [
              ["Opening", data.opening, true],
              ["Money in", data.totalIn, false],
              ["Money out", data.totalOut, false],
              ["Closing", data.closing, true],
            ] as const
          ).map(([label, value, signed]) => (
            <div key={label} className="bg-card min-w-0 rounded-lg border p-3">
              <dt className="text-muted-foreground text-xs">{label}</dt>
              <dd className="truncate font-medium">
                {signed ? (
                  <SignedAmount paise={value} />
                ) : (
                  <span className="tabular-nums">{formatPaise(value)}</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </section>
      {data.entries.length === 0 ? (
        <p className="text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm">
          Nothing moved through this account between {formatDate(data.from)} and{" "}
          {formatDate(data.to)}.
        </p>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-lg border md:block">
            <Table aria-label="Ledger">
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Particulars</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="whitespace-nowrap">
                    {formatDate(data.from)}
                  </TableCell>
                  <TableCell colSpan={4} className="font-medium">
                    Opening balance
                  </TableCell>
                  <TableCell className="text-right">
                    <SignedAmount paise={data.opening} />
                  </TableCell>
                </TableRow>
                {data.entries.map((line) => (
                  <TableRow key={line.id}>
                    <TableCell className="whitespace-nowrap">
                      {formatDate(line.entryDate)}
                    </TableCell>
                    <TableCell className="max-w-72">
                      <div className="flex items-center gap-2">
                        <span className="truncate">{particulars(line)}</span>
                        {line.isReversal ? (
                          <Badge variant="outline">Reversal</Badge>
                        ) : null}
                      </div>
                      <div className="text-muted-foreground truncate text-xs">
                        {[
                          line.paymentCategoryName,
                          line.projectName,
                          line.narration,
                        ]
                          .filter((part) => part != null && part !== "")
                          .join(" · ") || ENTRY_SOURCE_LABELS[line.sourceType]}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-40 truncate">
                      {modeLine(line)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Amount paise={Math.max(line.amount, 0)} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Amount paise={Math.max(-line.amount, 0)} />
                    </TableCell>
                    <TableCell className="text-right">
                      <SignedAmount paise={line.balance} />
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
                    <SignedAmount paise={data.closing} />
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
          <ul aria-label="Ledger entries" className="space-y-2 md:hidden">
            {data.entries.map((line) => (
              <li key={line.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {particulars(line)}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {formatDate(line.entryDate)} · {modeLine(line)}
                    </p>
                    {line.isReversal ? (
                      <Badge variant="outline" className="mt-1">
                        Reversal
                      </Badge>
                    ) : null}
                  </div>
                  <div className="shrink-0 text-right">
                    <SignedAmount
                      paise={line.amount}
                      className="text-sm font-medium"
                    />
                    <p className="text-muted-foreground text-xs">
                      Bal. <SignedAmount paise={line.balance} />
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
