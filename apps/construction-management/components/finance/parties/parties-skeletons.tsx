"use client";

import { Skeleton } from "@repo/ui/components/skeleton";
import {
  SkeletonGroup,
  SkeletonText,
  type SkeletonColumn,
} from "@repo/ui/components/skeleton-kit";
import { Tabs, TabsList, TabsTrigger } from "@repo/ui/components/tabs";

import { PageHeaderSkeleton } from "@/components/app-shell/page-header-skeleton";
import {
  ResponsiveListSkeleton,
  SummaryTilesSkeleton,
  srOnly,
} from "@/components/finance/finance-skeletons";
import type { PartyType } from "@/src/queries/finance-parties";

import { COLUMNS } from "./party-balances";
import { PARTY_SCREENS, partyPaths } from "./party-money";

/*
 * A party's money while it loads (ADR-0047). Real headings, tab names and
 * column headers; bars where the figures go.
 */

const WIDTHS = ["62%", "48%", "70%", "55%"];

export const PARTY_STATEMENT_COLUMNS: SkeletonColumn[] = [
  { header: "Date", kind: "muted" },
  { header: "Entry" },
  { header: "Document", kind: "muted" },
  { header: "Amount", kind: "number", className: "text-right" },
  { header: "Balance", kind: "number", className: "text-right" },
];

export const TDS_COLUMNS: SkeletonColumn[] = [
  { header: "Payment" },
  { header: "Date", kind: "muted" },
  { header: "Project", kind: "muted" },
  { header: "Paid", kind: "number", className: "text-right" },
  { header: "Base", kind: "number", className: "text-right" },
  { header: "Rate", kind: "number", className: "text-right" },
  { header: "TDS", kind: "number", className: "text-right" },
];

/** A party type's balances: the count line, then one row per party. */
export function PartyBalancesSkeleton({
  partyType,
  canPay = true,
}: {
  partyType: PartyType;
  canPay?: boolean;
}) {
  const columns: SkeletonColumn[] = [
    { header: "Name" },
    ...COLUMNS[partyType].map((column): SkeletonColumn => ({
      header: column.label,
      kind: "number",
      className: "text-right",
    })),
    ...(canPay
      ? [
          {
            header: srOnly("Actions"),
            kind: "actions",
            className: "w-20",
          } satisfies SkeletonColumn,
        ]
      : []),
  ];
  return (
    <ResponsiveListSkeleton
      label={`Loading ${PARTY_SCREENS[partyType].plural}`}
      count
      columns={columns}
    />
  );
}

/** Cards with a title and meta on the left, amounts on the right. */
export function PartyCardsSkeleton({
  label,
  rows = 3,
}: {
  label: string;
  rows?: number;
}) {
  return (
    <SkeletonGroup label={label}>
      <ul className="space-y-2">
        {WIDTHS.slice(0, rows).map((width, row) => (
          <li key={row} className="bg-card rounded-lg border p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-1">
                <SkeletonText size="base" width={width} />
                <SkeletonText size="xs" width="45%" />
              </div>
              <div className="flex shrink-0 flex-col items-end">
                <SkeletonText width="5.5rem" />
                <SkeletonText size="xs" width="4rem" />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </SkeletonGroup>
  );
}

export function PartyStatementSkeleton() {
  return (
    <ResponsiveListSkeleton
      label="Loading the statement"
      columns={PARTY_STATEMENT_COLUMNS}
    />
  );
}

/** The Opening balance card: its real heading, the amount line a bar. */
export function OpeningCardSkeleton() {
  return (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold">Opening balance</h2>
        <SkeletonGroup label="Loading the opening balance">
          <SkeletonText width="min(18rem, 70%)" />
        </SkeletonGroup>
      </div>
    </section>
  );
}

/**
 * One party's money page while its statement loads: the real back link,
 * the opening card, the real tabs over the invoices.
 */
export function PartyMoneyPageSkeleton({
  projectId,
  partyType,
}: {
  projectId: string;
  partyType: PartyType;
}) {
  const back = {
    label: PARTY_SCREENS[partyType].plural,
    href: partyPaths(projectId, partyType).tab,
  };
  return (
    <div className="w-full space-y-6">
      <PageHeaderSkeleton back={back} />
      <OpeningCardSkeleton />
      <Tabs defaultValue="invoices" className="gap-4">
        <TabsList>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="payments" disabled>
            Payments
          </TabsTrigger>
          <TabsTrigger value="statement" disabled>
            Statement
          </TabsTrigger>
        </TabsList>
        <PartyCardsSkeleton label="Loading invoices" />
      </Tabs>
    </div>
  );
}

/**
 * One party payment while it loads: the facts card and the invoices it
 * settles. The back link names the party, which is data, so it goes to
 * the party type's list.
 */
export function PartyPaymentDetailSkeleton({
  projectId,
  partyType,
}: {
  projectId: string;
  partyType: PartyType;
}) {
  return (
    <div className="w-full max-w-4xl space-y-6">
      <PageHeaderSkeleton
        back={{
          label: PARTY_SCREENS[partyType].plural,
          href: partyPaths(projectId, partyType).tab,
        }}
      />
      <SkeletonGroup label="Loading the payment" className="space-y-6">
        <div className="grid gap-x-6 gap-y-3 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="min-w-0">
              <SkeletonText size="xs" width="40%" />
              <SkeletonText width={WIDTHS[index % WIDTHS.length]} />
            </div>
          ))}
        </div>
        <section className="space-y-2">
          <h2 className="font-semibold">Invoices it settles</h2>
          <ul className="divide-y rounded-lg border">
            {WIDTHS.slice(0, 2).map((width, row) => (
              <li key={row} className="flex justify-between gap-3 p-3">
                <SkeletonText width={width} />
                <SkeletonText width="5rem" />
              </li>
            ))}
          </ul>
        </section>
      </SkeletonGroup>
    </div>
  );
}

/** Settlements of one status. */
export function SettlementsSkeleton() {
  return <PartyCardsSkeleton label="Loading settlements" rows={2} />;
}

/** A Contractor's TDS for a year: PAN, the four quarters, the ledger. */
export function TdsLedgerSkeleton() {
  return (
    <SkeletonGroup label="Loading the TDS ledger" className="space-y-4">
      <SkeletonText width="10rem" />
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">By quarter</h3>
        <SummaryTilesSkeleton
          labels={[0, 1, 2, 3].map((quarter) => (
            <SkeletonText key={quarter} size="xs" width="4rem" />
          ))}
          className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"
        />
      </section>
      <ResponsiveListSkeleton columns={TDS_COLUMNS} rows={3} />
    </SkeletonGroup>
  );
}

/** An invoice's facts while it loads: status chips, then label and value pairs. */
export function InvoiceDetailSkeleton() {
  return (
    <SkeletonGroup label="Loading the invoice" className="space-y-5">
      <div className="flex gap-2">
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="min-w-0">
            <SkeletonText size="xs" width="40%" />
            <SkeletonText width={WIDTHS[index % WIDTHS.length]} />
          </div>
        ))}
      </div>
    </SkeletonGroup>
  );
}

/** Party Balance in Workspace: the three totals, then a card per party. */
export function PartyBalancesWorkspaceSkeleton() {
  return (
    <SkeletonGroup label="Loading Party Balance" className="space-y-4">
      <SummaryTilesSkeleton
        labels={["Owed by the Company", "Owed to the Company", "Net"]}
        className="grid gap-3 sm:grid-cols-3"
      />
      <ul className="space-y-3">
        {WIDTHS.slice(0, 3).map((width, row) => (
          <li key={row} className="rounded-lg border p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <SkeletonText size="base" width={width} />
              <SkeletonText width="9rem" />
            </div>
            <div className="mt-2 divide-y rounded-md border">
              {[0, 1].map((line) => (
                <div
                  key={line}
                  className="flex items-center justify-between gap-2 px-3 py-2"
                >
                  <SkeletonText width="40%" />
                  <span className="flex items-center gap-3">
                    <SkeletonText width="5rem" />
                    <Skeleton className="h-8 w-24 rounded-md" />
                  </span>
                </div>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </SkeletonGroup>
  );
}

/** Open invoices to allocate a payment against. */
export function AllocationSkeleton() {
  return (
    <SkeletonGroup label="Loading open invoices">
      <ul className="divide-y rounded-lg border">
        {WIDTHS.slice(0, 3).map((width, row) => (
          <li
            key={row}
            className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0 flex-1 space-y-0.5">
              <SkeletonText width={width} />
              <SkeletonText size="xs" width="40%" />
            </div>
            <Skeleton className="h-10 w-full shrink-0 rounded-md sm:w-44" />
          </li>
        ))}
      </ul>
    </SkeletonGroup>
  );
}
