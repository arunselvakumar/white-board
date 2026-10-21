"use client";

import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import Link from "next/link";
import { Suspense, useState, type ReactNode } from "react";
import { Button, buttonVariants } from "@repo/ui/components/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/ui/components/tabs";

import { canInFinance, financeAccessQuery } from "@/src/queries/finance-access";
import type { PartyType } from "@/src/queries/finance-parties";

import { AwaitingGrns } from "./awaiting-grns";
import { InvoiceDialog, type InvoiceDialogTarget } from "./invoice-dialog";
import { PartyBalances } from "./party-balances";
import { PARTY_SCREENS, partyPaths } from "./party-money";
import { SettlementList } from "./settlement-list";
import { TdsLedgerView } from "./tds-ledger";
import { PartyBalancesSkeleton } from "./parties-skeletons";

/**
 * A party type's tab of the Project's Payments (CM-705 Suppliers, CM-706
 * Contractors; CM-708 reuses it for Other Parties): balances per party
 * with New invoice and Record payment, and the Settlements waiting for
 * approval (CM-708); Suppliers add the GRNs awaiting an invoice,
 * Contractors the TDS ledger.
 */
export function PartyMoneyTab({
  projectId,
  partyType,
  today,
}: {
  projectId: string;
  partyType: PartyType;
  today?: string;
}) {
  const access = useQuery(financeAccessQuery(projectId)).data;
  const canCreate =
    access != null && canInFinance(access, "finance.parties", "create");
  const screen = PARTY_SCREENS[partyType];
  const paths = partyPaths(projectId, partyType);
  const [invoiceTarget, setInvoiceTarget] =
    useState<InvoiceDialogTarget | null>(null);

  const balances: ReactNode = (
    <div className="space-y-4">
      {partyType === "supplier" && (
        <Suspense fallback={null}>
          <AwaitingGrns
            projectId={projectId}
            canCreate={canCreate}
            onCreate={(grns) => {
              setInvoiceTarget({ mode: "new", goodsReceipts: grns });
            }}
          />
        </Suspense>
      )}
      <Suspense
        fallback={
          <PartyBalancesSkeleton partyType={partyType} canPay={canCreate} />
        }
      >
        <PartyBalances
          projectId={projectId}
          partyType={partyType}
          canPay={canCreate}
        />
      </Suspense>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{screen.plural}</h2>
        {canCreate && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setInvoiceTarget({ mode: "new" });
              }}
            >
              <Plus aria-hidden="true" />
              New invoice
            </Button>
            <Link href={paths.pay()} className={buttonVariants()}>
              Record payment
            </Link>
          </div>
        )}
      </div>
      <Tabs defaultValue="balances" className="gap-4">
        <TabsList>
          <TabsTrigger value="balances">Balances</TabsTrigger>
          <TabsTrigger value="settlements">Settlements</TabsTrigger>
          {screen.tds && <TabsTrigger value="tds">TDS</TabsTrigger>}
        </TabsList>
        <TabsContent value="balances">{balances}</TabsContent>
        <TabsContent value="settlements">
          <SettlementList projectId={projectId} partyType={partyType} />
        </TabsContent>
        {screen.tds && (
          <TabsContent value="tds">
            <TdsLedgerView projectId={projectId} today={today} />
          </TabsContent>
        )}
      </Tabs>
      <InvoiceDialog
        projectId={projectId}
        partyType={partyType}
        target={invoiceTarget}
        onOpenChange={(open) => {
          if (!open) setInvoiceTarget(null);
        }}
      />
    </div>
  );
}
