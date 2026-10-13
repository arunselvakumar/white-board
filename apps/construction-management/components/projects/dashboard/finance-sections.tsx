"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CreditCard,
  Scale,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import { MetricCard } from "@repo/ui/components/metric-card";
import { cn } from "@repo/ui/lib/utils";

import { formatPaise } from "@/components/money/money-input";
import type { Duration } from "@/lib/dashboard-duration";
import {
  financeDashboardQuery,
  type PaymentsDashboard,
} from "@/src/queries/finance-dashboard";

import {
  Fact,
  Rupees,
  Section,
  SectionSkeleton,
  denied,
} from "./dashboard-parts";

const MONTH = new Intl.DateTimeFormat("en-IN", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function monthLabel(month: string): string {
  return MONTH.format(new Date(`${month}-01T00:00:00Z`));
}

type Month = PaymentsDashboard["months"][number];

/**
 * Payment In & Out per month (CM-709): a pair of bars per month, money in
 * in the primary hue and money out in the second chart hue, with a legend.
 * Hover, touch or the arrow keys pick a month whose in, out and balance
 * are read out above the chart. A table of every month sits behind it for
 * screen readers (in a hidden wrapper, never `sr-only` on the table).
 */
export function PaymentFlowChart({ months }: { months: readonly Month[] }) {
  const [active, setActive] = useState(months.length - 1);
  const titleId = useId();
  const max = Math.max(
    1,
    ...months.map((month) => Math.max(month.in, month.out)),
  );
  const shown = months[active] ?? months.at(-1);
  const last = Math.max(0, months.length - 1);
  const height = (value: number) =>
    value === 0 ? "0" : `max(2px, ${String((value / max) * 100)}%)`;

  return (
    <figure aria-labelledby={titleId} className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <figcaption id={titleId} className="text-sm font-semibold">
          Payment in and out per month
        </figcaption>
        {shown == null ? null : (
          <p className="text-muted-foreground text-xs" aria-live="polite">
            {monthLabel(shown.month)}: in {formatPaise(shown.in)}, out{" "}
            {formatPaise(shown.out)}, balance {formatPaise(shown.balance)}
          </p>
        )}
      </div>
      <div
        className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs"
        aria-hidden="true"
      >
        <span className="flex items-center gap-1.5">
          <span className="bg-primary inline-block size-2.5 rounded-sm" />
          Payment in
        </span>
        <span className="flex items-center gap-1.5">
          <span className="bg-chart-2 inline-block size-2.5 rounded-sm" />
          Payment out
        </span>
      </div>
      <div
        role="slider"
        tabIndex={0}
        aria-label="Month"
        aria-valuemin={0}
        aria-valuemax={last}
        aria-valuenow={active}
        aria-valuetext={
          shown == null
            ? undefined
            : `${monthLabel(shown.month)}, in ${formatPaise(shown.in)}, out ${formatPaise(shown.out)}`
        }
        className="focus-visible:ring-ring/50 border-border flex h-40 w-full touch-pan-y items-end gap-1 rounded-md border-b outline-none focus-visible:ring-3"
        onPointerLeave={() => {
          setActive(last);
        }}
        onKeyDown={(event) => {
          const step =
            event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
          if (step === 0) return;
          event.preventDefault();
          setActive((current) => Math.min(last, Math.max(0, current + step)));
        }}
      >
        {months.map((month, index) => (
          <div
            key={month.month}
            aria-hidden="true"
            className="flex h-full min-w-0 flex-1 items-end gap-px"
            onPointerEnter={() => {
              setActive(index);
            }}
            onPointerDown={() => {
              setActive(index);
            }}
          >
            <div
              className={cn(
                "w-1/2 rounded-t-[3px] transition-opacity",
                "bg-primary",
                index === active ? "opacity-100" : "opacity-60",
              )}
              style={{ height: height(month.in) }}
            />
            <div
              className={cn(
                "w-1/2 rounded-t-[3px] transition-opacity",
                "bg-chart-2",
                index === active ? "opacity-100" : "opacity-60",
              )}
              style={{ height: height(month.out) }}
            />
          </div>
        ))}
      </div>
      <div
        className="text-muted-foreground flex justify-between text-[0.7rem]"
        aria-hidden="true"
      >
        <span>{months[0] == null ? "" : monthLabel(months[0].month)}</span>
        <span>
          {months.at(-1) == null ? "" : monthLabel(months.at(-1)?.month ?? "")}
        </span>
      </div>
      <div className="sr-only">
        <table>
          <caption>Payment in and out per month</caption>
          <thead>
            <tr>
              <th scope="col">Month</th>
              <th scope="col">Payment in</th>
              <th scope="col">Payment out</th>
              <th scope="col">Balance</th>
            </tr>
          </thead>
          <tbody>
            {months.map((month) => (
              <tr key={month.month}>
                <th scope="row">{monthLabel(month.month)}</th>
                <td>{formatPaise(month.in)}</td>
                <td>{formatPaise(month.out)}</td>
                <td>{formatPaise(month.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

const PARTY_TYPE_LABELS = {
  contractor: "Contractor",
  supplier: "Supplier",
  other_party: "Other Party",
} as const;

/**
 * Due Payments (CM-709): parties with something due on bills from them on
 * this Project. At phone width Invoiced and Paid move under the party's
 * name, so the table never scrolls sideways.
 */
export function DuePaymentsTable({
  dues,
}: {
  dues: PaymentsDashboard["dues"];
}) {
  const headingId = useId();
  return (
    <div className="min-w-0 space-y-3">
      <h3 className="text-sm font-semibold" id={headingId}>
        Due payments
      </h3>
      {dues.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Nothing is due to any party on this Project.
        </p>
      ) : (
        <table
          aria-labelledby={headingId}
          className="w-full table-fixed text-sm"
        >
          <thead className="text-muted-foreground border-b text-left text-xs">
            <tr>
              <th
                scope="col"
                className="w-[46%] py-2 pr-2 font-medium sm:w-[34%]"
              >
                Party
              </th>
              <th
                scope="col"
                className="hidden py-2 pl-2 text-right font-medium sm:table-cell"
              >
                Invoiced
              </th>
              <th
                scope="col"
                className="hidden py-2 pl-2 text-right font-medium sm:table-cell"
              >
                Paid
              </th>
              <th scope="col" className="py-2 pl-2 text-right font-medium">
                Due
              </th>
              <th scope="col" className="py-2 pl-2 text-right font-medium">
                Overdue
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {dues.map((due) => (
              <tr key={`${due.partyType}:${due.partyId}`}>
                <th scope="row" className="py-2 pr-2 text-left font-normal">
                  <span className="block truncate font-medium">{due.name}</span>
                  <span className="text-muted-foreground block truncate text-xs">
                    {PARTY_TYPE_LABELS[due.partyType]}
                  </span>
                  <span className="text-muted-foreground block text-xs sm:hidden">
                    Invoiced {formatPaise(due.invoiced)} · Paid{" "}
                    {formatPaise(due.paid)}
                  </span>
                </th>
                <td className="hidden py-2 pl-2 text-right tabular-nums sm:table-cell">
                  {formatPaise(due.invoiced)}
                </td>
                <td className="hidden py-2 pl-2 text-right tabular-nums sm:table-cell">
                  {formatPaise(due.paid)}
                </td>
                <td className="py-2 pl-2 text-right font-medium tabular-nums">
                  {formatPaise(due.due)}
                </td>
                <td
                  className={cn(
                    "py-2 pl-2 text-right tabular-nums",
                    due.overdue > 0
                      ? "text-destructive"
                      : "text-muted-foreground",
                  )}
                >
                  {formatPaise(due.overdue)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const MODULES = [
  { key: "contractor", label: "Contractor" },
  { key: "supplier", label: "Supplier" },
  { key: "labour", label: "Labour" },
  { key: "vendor", label: "Vendor" },
  { key: "other_party", label: "Other Party" },
  { key: "other_expense", label: "Other Expenses" },
] as const;

/**
 * Module Wise Payment (CM-709): money paid out on this Project in the
 * duration by module, one horizontal bar each with its amount and share.
 * Each row says its figure, so no hidden table is needed.
 */
export function ModuleWisePayment({
  modules,
}: {
  modules: PaymentsDashboard["modules"];
}) {
  const titleId = useId();
  const total = MODULES.reduce((sum, module) => sum + modules[module.key], 0);
  const max = Math.max(1, ...MODULES.map((module) => modules[module.key]));
  return (
    <figure aria-labelledby={titleId} className="min-w-0 space-y-3">
      <figcaption id={titleId} className="text-sm font-semibold">
        Module wise payment
      </figcaption>
      {total === 0 ? (
        <p className="text-muted-foreground text-sm">
          Nothing was paid out on this Project in this period.
        </p>
      ) : (
        <ol className="space-y-2.5" aria-labelledby={titleId}>
          {MODULES.map((module) => {
            const amount = modules[module.key];
            const share = Math.round((amount / total) * 100);
            return (
              <li key={module.key} className="min-w-0 space-y-1">
                <div className="flex min-w-0 items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">{module.label}</span>
                  <span className="shrink-0 font-medium tabular-nums">
                    {formatPaise(amount)}
                    <span className="text-muted-foreground ml-1.5 text-xs font-normal">
                      {share}%
                    </span>
                  </span>
                </div>
                <div
                  className="bg-muted h-2 w-full rounded-full"
                  aria-hidden="true"
                >
                  <div
                    className="bg-primary h-2 rounded-full"
                    style={{
                      width:
                        amount === 0
                          ? "0"
                          : `max(2px, ${String((amount / max) * 100)}%)`,
                    }}
                  />
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </figure>
  );
}

/**
 * Payments (CM-709, ADR CM-0017 §16): money in and out of accounts on this
 * Project by month with the running balance, Due Payments and Module Wise
 * Payment. Needs Payments Read on the Project.
 */
export function PaymentsSection({
  projectId,
  duration,
}: {
  projectId: string;
  duration: Duration;
}) {
  const { data, isPending, error } = useQuery(
    financeDashboardQuery(projectId, duration),
  );
  const payments = data?.payments;
  return (
    <Section
      id="dashboard-payments"
      title="Payments"
      aside={
        <Link
          href={`/app/projects/${encodeURIComponent(projectId)}/payments`}
          className="text-primary text-sm font-medium underline-offset-4 hover:underline"
        >
          Payments
        </Link>
      }
    >
      {isPending ? (
        <SectionSkeleton />
      ) : error != null ? (
        <p className="text-muted-foreground text-sm">
          {denied(error)
            ? "Payments need the Dashboard permission on this Project."
            : "Payments could not be loaded."}
        </p>
      ) : payments == null ? (
        <p className="text-muted-foreground text-sm">
          Payments need the Payments permission on this Project.
        </p>
      ) : (
        <div className="space-y-5">
          <dl className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Fact label="Payment in" icon={ArrowDownLeft}>
              <Rupees paise={payments.totals.in} />
            </Fact>
            <Fact label="Payment out" icon={ArrowUpRight}>
              <Rupees paise={payments.totals.out} />
            </Fact>
            <Fact label="Net" icon={Scale}>
              <Rupees paise={payments.totals.net} />
            </Fact>
            <Fact label="Balance" icon={Wallet}>
              <Rupees paise={payments.months.at(-1)?.balance ?? 0} />
            </Fact>
          </dl>
          <PaymentFlowChart months={payments.months} />
          {/* Five money columns need the full width; stacked, not side by side. */}
          <DuePaymentsTable dues={payments.dues} />
          <ModuleWisePayment modules={payments.modules} />
        </div>
      )}
    </Section>
  );
}

/**
 * Pending Transactions, transfers, petty-cash vouchers, Other Expenses and
 * settlements the viewer may decide on this Project (CM-709); "—" when
 * they may decide none of them.
 */
export function PaymentApprovalsTile({
  projectId,
  duration,
}: {
  projectId: string;
  duration: Duration;
}) {
  const { data, error } = useQuery(financeDashboardQuery(projectId, duration));
  const approvals = data?.approvals;
  const counted = (count: number | null, one: string, many: string) =>
    count == null ? null : `${String(count)} ${count === 1 ? one : many}`;
  const parts =
    approvals == null
      ? []
      : [
          counted(approvals.transactions, "transaction", "transactions"),
          counted(approvals.transfers, "transfer", "transfers"),
          counted(approvals.vouchers, "voucher", "vouchers"),
          counted(approvals.otherExpenses, "expense", "expenses"),
          counted(approvals.settlements, "settlement", "settlements"),
        ].filter((part) => part != null);
  const any = parts.length > 0;
  const base = `/app/projects/${encodeURIComponent(projectId)}/payments`;
  return (
    <li className="flex min-w-0">
      <MetricCard
        className="w-full"
        label="Payment Approvals"
        icon={CreditCard}
        value={
          any && approvals != null ? (
            approvals.total
          ) : (
            <span className="text-muted-foreground">—</span>
          )
        }
        caption={
          error != null
            ? "Could not be loaded"
            : approvals == null
              ? "Loading…"
              : any
                ? `Pending: ${parts.join(" · ")}`
                : "Nothing here for you to approve"
        }
        render={
          any && approvals != null ? (
            <Link
              href={
                (approvals.transactions ?? 0) > 0
                  ? `${base}/transactions`
                  : base
              }
            />
          ) : undefined
        }
      />
    </li>
  );
}
