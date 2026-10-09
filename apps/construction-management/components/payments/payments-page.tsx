"use client";

import { Suspense, useState } from "react";
import { Skeleton } from "@repo/ui/components/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/ui/components/tabs";

import type {
  BalancePeriod,
  PartyBalanceRow,
  PaymentPartyType,
} from "@/src/queries/balances";

import { BalancesTable } from "./balances-table";
import { PayDialog, type PayTarget } from "./pay-dialog";
import { localToday, rangeOf } from "./payment-format";
import { PaymentsList } from "./payments-list";
import { PeriodSwitcher } from "./period-switcher";
import { StatementSheet, type StatementTarget } from "./statement-sheet";

export type PaymentsTab = "labour" | "vendor" | "payments";

/**
 * A Project's Payments (CM-216): Labour and Vendor balances for a period
 * with Pay and the statement, and the list of recorded payments.
 */
export function PaymentsPage({
  projectId,
  initialTab = "labour",
  today,
}: {
  projectId: string;
  initialTab?: PaymentsTab;
  /** Defaults to today on this device. */
  today?: string;
}) {
  const [period, setPeriod] = useState<BalancePeriod>(() => ({
    kind: "monthly",
    anchor: today ?? localToday(),
  }));
  return (
    <Tabs defaultValue={initialTab} className="gap-4">
      <TabsList>
        <TabsTrigger value="labour">Labour</TabsTrigger>
        <TabsTrigger value="vendor">Vendor</TabsTrigger>
        <TabsTrigger value="payments">Payments</TabsTrigger>
      </TabsList>
      {(["labour", "vendor"] as const).map((partyType) => (
        <TabsContent key={partyType} value={partyType} className="space-y-4">
          <BalancesPanel
            projectId={projectId}
            partyType={partyType}
            period={period}
            onPeriod={setPeriod}
            today={today}
          />
        </TabsContent>
      ))}
      <TabsContent value="payments">
        <PaymentsList projectId={projectId} />
      </TabsContent>
    </Tabs>
  );
}

function BalancesPanel({
  projectId,
  partyType,
  period,
  onPeriod,
  today,
}: {
  projectId: string;
  partyType: PaymentPartyType;
  period: BalancePeriod;
  onPeriod: (next: BalancePeriod) => void;
  today?: string;
}) {
  const [paying, setPaying] = useState<PayTarget | null>(null);
  const [statement, setStatement] = useState<StatementTarget | null>(null);
  const toTarget = (row: PartyBalanceRow) => ({
    id: row.partyId,
    name: row.name,
    finalAmount: row.finalAmount,
  });
  return (
    <>
      <PeriodSwitcher value={period} onChange={onPeriod} />
      <Suspense
        fallback={
          <div className="space-y-2" aria-busy="true">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        }
      >
        <BalancesTable
          projectId={projectId}
          partyType={partyType}
          period={period}
          onPay={(row) => {
            setPaying(toTarget(row));
          }}
          onStatement={(row) => {
            setStatement(toTarget(row));
          }}
        />
      </Suspense>
      <PayDialog
        projectId={projectId}
        partyType={partyType}
        party={paying}
        today={today}
        onOpenChange={(open) => {
          if (!open) setPaying(null);
        }}
      />
      <StatementSheet
        projectId={projectId}
        partyType={partyType}
        party={statement}
        range={rangeOf(period)}
        onOpenChange={(open) => {
          if (!open) setStatement(null);
        }}
      />
    </>
  );
}
