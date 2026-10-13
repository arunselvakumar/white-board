"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { BookOpen, Landmark, Wallet } from "lucide-react";
import Link from "next/link";
import { Suspense, useState } from "react";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Skeleton } from "@repo/ui/components/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/ui/components/tabs";
import { cn } from "@repo/ui/lib/utils";

import { PageHeader } from "@/components/app-shell/page-header";
import { formatPaise } from "@/components/money/money-input";
import { formatDate } from "@/components/payments/payment-format";
import { RecentReports } from "@/components/reports/recent-reports";
import {
  CENTRAL_FINANCE_REPORT_CATALOGUE,
  deviceToday,
  type ReportDefinition,
} from "@/components/reports/report-catalogue";
import {
  ReportGroup,
  type FilterOptions,
} from "@/components/reports/reports-page";
import {
  centralPaymentQuery,
  type CentralPartyDue,
  type CentralPaymentSummary,
} from "@/src/queries/finance-central-payment";
import { counterpartyOptionsQuery } from "@/src/queries/finance-lookups";

/** Workspace → Central Payment (CM-709). */
export const CENTRAL_PAYMENT_PATH = "/app/workspace/central-payment";

/** Masters → Company's Bank A/C, where the accounts are kept (CM-701). */
const BANK_ACCOUNTS_PATH = "/app/masters/bank-accounts";

const PARTY_TABS = [
  { value: "contractor", label: "Contractors", noun: "Contractor" },
  { value: "supplier", label: "Suppliers", noun: "Supplier" },
  { value: "other_party", label: "Other Parties", noun: "Other Party" },
] as const;

type PartyTab = (typeof PARTY_TABS)[number]["value"];

function count(n: number, one: string, many: string): string {
  return `${String(n)} ${n === 1 ? one : many}`;
}

function Amount({
  value,
  tone,
  className,
}: {
  value: number;
  /** Red when the figure is bad news: overdue, or a negative balance. */
  tone?: "warn-positive" | "warn-negative";
  className?: string;
}) {
  const warn =
    (tone === "warn-positive" && value > 0) ||
    (tone === "warn-negative" && value < 0);
  return (
    <span
      className={cn(
        "whitespace-nowrap tabular-nums",
        warn && "text-destructive",
        className,
      )}
    >
      {formatPaise(value)}
    </span>
  );
}

function sum(
  rows: readonly CentralPartyDue[],
  pick: (row: CentralPartyDue) => number,
) {
  return rows.reduce((total, row) => total + pick(row), 0);
}

/**
 * One kind of party's dues across the Projects in scope. At phone width
 * Invoiced, Paid and Advance move under the party's name so the table
 * never scrolls sideways; Overdue shows in red.
 */
function PartyDuesTable({
  rows,
  noun,
  receivables,
}: {
  rows: readonly CentralPartyDue[];
  noun: string;
  /** Other Parties also owe the Company on sales invoices. */
  receivables: boolean;
}) {
  if (rows.length === 0)
    return (
      <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">
        No {noun} has invoices, payments or a balance on these Projects.
      </p>
    );
  const wide = "hidden py-2 pl-2 text-right sm:table-cell";
  // On a phone the table sizes Due and Balance to their amounts and the
  // name column takes what is left (max-w-0 lets it shrink and truncate),
  // so a long amount never pushes the page sideways. An amount wider than the
  // phone scrolls inside the wrapper instead of the page.
  return (
    <div className="w-full min-w-0 overflow-x-auto">
      <table
        aria-label={`${noun} dues`}
        className="w-full table-auto text-sm sm:table-fixed"
      >
        <thead className="text-muted-foreground border-b text-left text-xs">
          <tr>
            <th
              scope="col"
              className="w-full max-w-0 py-2 pr-2 font-medium sm:w-[28%] sm:max-w-none"
            >
              {noun}
            </th>
            <th scope="col" className={`${wide} font-medium`}>
              Invoiced
            </th>
            <th scope="col" className={`${wide} font-medium`}>
              Paid
            </th>
            <th scope="col" className="py-2 pl-2 text-right font-medium">
              Due
            </th>
            <th scope="col" className={`${wide} font-medium`}>
              Overdue
            </th>
            <th scope="col" className={`${wide} font-medium`}>
              {receivables ? "Receivable" : "Advance"}
            </th>
            <th scope="col" className="py-2 pl-2 text-right font-medium">
              Balance
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => (
            <tr key={row.partyId}>
              <th
                scope="row"
                className="max-w-0 py-2 pr-2 text-left align-top font-normal sm:max-w-none"
              >
                <span className="block truncate font-medium">{row.name}</span>
                <span className="text-muted-foreground block text-xs">
                  {count(row.projectCount, "Project", "Projects")}
                </span>
                <span className="text-muted-foreground block text-xs sm:hidden">
                  Invoiced {formatPaise(row.invoiced)} · Paid{" "}
                  {formatPaise(row.paid)}
                </span>
                {row.overdue > 0 ? (
                  <span className="text-destructive block text-xs sm:hidden">
                    Overdue {formatPaise(row.overdue)}
                  </span>
                ) : null}
                {(receivables ? row.receivable : row.advance) > 0 ? (
                  <span className="text-muted-foreground block text-xs sm:hidden">
                    {receivables ? "Receivable" : "Advance"}{" "}
                    {formatPaise(receivables ? row.receivable : row.advance)}
                  </span>
                ) : null}
              </th>
              <td className={wide}>
                <Amount value={row.invoiced} />
              </td>
              <td className={wide}>
                <Amount value={row.paid} />
              </td>
              <td className="py-2 pl-2 text-right align-top font-medium">
                <Amount value={row.due} />
              </td>
              <td className={wide}>
                <Amount value={row.overdue} tone="warn-positive" />
              </td>
              <td className={wide}>
                <Amount value={receivables ? row.receivable : row.advance} />
              </td>
              <td className="py-2 pl-2 text-right align-top">
                <Amount value={row.balance} />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t font-medium">
          <tr>
            <th
              scope="row"
              className="max-w-0 py-2 pr-2 text-left sm:max-w-none"
            >
              Total
            </th>
            <td className={wide}>
              <Amount value={sum(rows, (row) => row.invoiced)} />
            </td>
            <td className={wide}>
              <Amount value={sum(rows, (row) => row.paid)} />
            </td>
            <td className="py-2 pl-2 text-right">
              <Amount value={sum(rows, (row) => row.due)} />
            </td>
            <td className={wide}>
              <Amount
                value={sum(rows, (row) => row.overdue)}
                tone="warn-positive"
              />
            </td>
            <td className={wide}>
              <Amount
                value={sum(rows, (row) =>
                  receivables ? row.receivable : row.advance,
                )}
              />
            </td>
            <td className="py-2 pl-2 text-right">
              <Amount value={sum(rows, (row) => row.balance)} />
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function PartyDues({ summary }: { summary: CentralPaymentSummary }) {
  const [tab, setTab] = useState<PartyTab>("contractor");
  return (
    <section aria-labelledby="party-dues-heading" className="space-y-3">
      <div className="space-y-1">
        <h2 id="party-dues-heading" className="text-lg font-semibold">
          Party dues
        </h2>
        <p className="text-muted-foreground text-sm">
          Due is what is left on bills from the party; Paid counts TDS and
          write-offs; Advance is paid but not yet set against a bill. A positive
          balance is owed to the party.
        </p>
      </div>
      <Tabs
        value={tab}
        onValueChange={(next) => {
          setTab(next as PartyTab);
        }}
      >
        <TabsList aria-label="Party type" className="w-full sm:w-fit">
          {PARTY_TABS.map((item) => (
            <TabsTrigger
              key={item.value}
              value={item.value}
              className="min-w-0 flex-1 sm:flex-none"
            >
              {item.label}
              <span className="text-muted-foreground ml-1 hidden text-xs tabular-nums sm:inline">
                {summary.parties[item.value].length}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
        {PARTY_TABS.map((item) => (
          <TabsContent key={item.value} value={item.value} className="pt-3">
            <PartyDuesTable
              rows={summary.parties[item.value]}
              noun={item.noun}
              receivables={item.value === "other_party"}
            />
          </TabsContent>
        ))}
      </Tabs>
    </section>
  );
}

function Accounts({
  accounts,
  ledger,
  onLedger,
}: {
  accounts: NonNullable<CentralPaymentSummary["accounts"]>;
  ledger: boolean;
  onLedger: (accountId: string) => void;
}) {
  return (
    <section aria-labelledby="accounts-heading" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="accounts-heading" className="text-lg font-semibold">
          Accounts
        </h2>
        <Link
          href={BANK_ACCOUNTS_PATH}
          className="text-primary text-sm font-medium underline-offset-4 hover:underline"
        >
          Company&apos;s Bank A/C
        </Link>
      </div>
      {accounts.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">
          There are no company accounts yet.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2" aria-label="Company accounts">
          {accounts.map((account) => (
            <li
              key={account.id}
              className="bg-card flex min-w-0 flex-col gap-2 rounded-xl border p-4"
            >
              <div className="flex min-w-0 items-start gap-3">
                <span className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-lg">
                  <Landmark aria-hidden="true" className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{account.name}</p>
                  <p className="text-muted-foreground truncate text-xs">
                    {[
                      account.kind === "bank" ? "Bank" : "Cash",
                      account.bankName,
                      account.accountLast4 == null
                        ? null
                        : `A/C ending ${account.accountLast4}`,
                    ]
                      .filter((part) => part != null)
                      .join(" · ")}
                  </p>
                </div>
                {account.isPrimary ? (
                  <Badge variant="secondary">Primary</Badge>
                ) : null}
              </div>
              <p className="text-xl font-semibold">
                <Amount value={account.balance} tone="warn-negative" />
              </p>
              <p className="text-muted-foreground text-xs">
                {account.pendingCount === 0
                  ? "Nothing pending"
                  : `${count(account.pendingCount, "pending document", "pending documents")}: ${formatPaise(account.pendingTotal)}`}
              </p>
              {ledger ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="self-start"
                  onClick={() => {
                    onLedger(account.id);
                  }}
                >
                  <BookOpen aria-hidden="true" />
                  Ledger
                  <span className="sr-only"> of {account.name}</span>
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PettyCash({
  accounts,
  ledger,
  onLedger,
}: {
  accounts: NonNullable<CentralPaymentSummary["pettyCash"]>;
  ledger: boolean;
  onLedger: (accountId: string) => void;
}) {
  return (
    <section aria-labelledby="petty-cash-heading" className="space-y-3">
      <h2 id="petty-cash-heading" className="text-lg font-semibold">
        Petty cash
      </h2>
      {accounts.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">
          There is no petty-cash account you can see.
        </p>
      ) : (
        <ul
          className="divide-y rounded-xl border"
          aria-label="Petty-cash accounts"
        >
          {accounts.map((account) => (
            <li
              key={account.id}
              className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 p-3"
            >
              <span className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-lg">
                <Wallet aria-hidden="true" className="size-4" />
              </span>
              <div className="min-w-[11rem] flex-1">
                <p className="truncate text-sm font-medium">
                  {account.holderName}
                  {account.isOwn ? (
                    <span className="text-muted-foreground font-normal">
                      {" "}
                      (you)
                    </span>
                  ) : null}
                </p>
                <p className="text-muted-foreground truncate text-xs">
                  {account.name}
                  {" · "}
                  {account.lastVoucherDate == null
                    ? "No vouchers yet"
                    : `Last voucher ${formatDate(account.lastVoucherDate)}`}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold">
                  <Amount value={account.balance} tone="warn-negative" />
                </p>
                <p className="text-muted-foreground text-xs">
                  {account.pendingCount === 0
                    ? "Nothing pending"
                    : `Pending ${formatPaise(account.pendingTotal)}`}
                </p>
              </div>
              {ledger ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    onLedger(account.id);
                  }}
                >
                  <BookOpen aria-hidden="true" />
                  Ledger
                  <span className="sr-only"> of {account.name}</span>
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * The central reports the viewer may run (Ledger, TDS 194C, Due
 * Payments), with the accounts for the Ledger and the Contractors for TDS
 * as filter choices, then their recent central reports.
 */
function CentralReports({
  summary,
  today,
  ledgerAccount,
}: {
  summary: CentralPaymentSummary;
  today: string;
  ledgerAccount: string | null;
}) {
  const { ledger, tds194c, duePayments } = summary.reports;
  const shows: Record<string, boolean> = {
    account_ledger: ledger.company || ledger.pettyCash,
    tds_194c: tds194c,
    due_payments: duePayments,
  };
  const definitions: ReportDefinition[] =
    CENTRAL_FINANCE_REPORT_CATALOGUE.filter(
      (definition) => shows[definition.kind] === true,
    );
  const { data: contractors } = useQuery({
    ...counterpartyOptionsQuery("contractor", null),
    enabled: tds194c,
    retry: false,
  });
  if (definitions.length === 0) return null;
  const filters: FilterOptions = {
    account: [
      ...(ledger.company ? (summary.accounts ?? []) : []).map((account) => ({
        value: account.id,
        label: account.name,
      })),
      ...(ledger.pettyCash ? (summary.pettyCash ?? []) : []).map((account) => ({
        value: account.id,
        label: `${account.name} (${account.holderName})`,
      })),
    ],
    contractor: (contractors?.items ?? []).map((item) => ({
      value: item.id,
      label: item.name,
    })),
  };
  return (
    <div id="central-reports" className="space-y-8">
      <ReportGroup
        id="central-reports-heading"
        title="Reports"
        description="Company-wide finance reports, each an Excel workbook and a PDF. Only you and the Owner can open the central reports you generate."
        definitions={definitions}
        projectId={null}
        today={today}
        filters={filters}
        initialFilters={
          ledgerAccount == null ? undefined : { account_ledger: ledgerAccount }
        }
      />
      <section aria-labelledby="central-recent-heading" className="space-y-3">
        <h2 id="central-recent-heading" className="text-lg font-semibold">
          Your recent central reports
        </h2>
        <Suspense
          fallback={
            <div className="space-y-2" aria-hidden="true">
              <Skeleton className="h-16 w-full" />
            </div>
          }
        >
          <RecentReports projectId={null} />
        </Suspense>
      </section>
    </div>
  );
}

/**
 * Workspace → Central Payment (CM-709, ADR CM-0017 §16): party dues for
 * Contractors, Suppliers and Other Parties across every Project (the
 * Owner) or the Projects the viewer is on; each company account's balance
 * today with what is pending (Company's Bank A/C Read); the petty-cash
 * accounts with their holders (Petty Cash Read); and the central reports.
 * Ledger on an account starts the Ledger report on it.
 */
export function CentralPaymentPage({
  today = deviceToday(),
}: {
  /** `YYYY-MM-DD`; the report cards' default periods end today. */
  today?: string;
}) {
  const { data: summary } = useSuspenseQuery(centralPaymentQuery);
  const [ledgerAccount, setLedgerAccount] = useState<string | null>(null);
  const ledger = summary.reports.ledger;
  const openLedger = (accountId: string) => {
    setLedgerAccount(accountId);
    requestAnimationFrame(() => {
      const card = document.querySelector<HTMLFormElement>(
        'form[aria-label="Ledger"]',
      );
      card?.scrollIntoView({ behavior: "smooth", block: "start" });
      card?.querySelector<HTMLButtonElement>('button[type="submit"]')?.focus({
        preventScroll: true,
      });
    });
  };
  return (
    <div className="w-full min-w-0 p-6">
      <div className="w-full max-w-6xl min-w-0 space-y-8">
        <PageHeader
          title="Central Payment"
          meta={`Dues and balances on ${formatDate(summary.asOn)}, ${
            summary.allProjects
              ? `across every Project (${String(summary.projectCount)}) and Store`
              : `across the ${count(summary.projectCount, "Project", "Projects")} you are on`
          }.`}
        />
        <PartyDues summary={summary} />
        {summary.accounts == null ? null : (
          <Accounts
            accounts={summary.accounts}
            ledger={ledger.company}
            onLedger={openLedger}
          />
        )}
        {summary.pettyCash == null ? null : (
          <PettyCash
            accounts={summary.pettyCash}
            ledger={ledger.pettyCash}
            onLedger={openLedger}
          />
        )}
        <CentralReports
          summary={summary}
          today={today}
          ledgerAccount={ledgerAccount}
        />
      </div>
    </div>
  );
}
