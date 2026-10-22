"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import Link from "next/link";
import { Suspense, useState } from "react";
import { Button, buttonVariants } from "@repo/ui/components/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/ui/components/tabs";

import { PageHeader } from "@/components/app-shell/page-header";
import { canInFinance, financeAccessQuery } from "@/src/queries/finance-access";
import {
  partyStatementQuery,
  type PartyType,
} from "@/src/queries/finance-parties";

import { ClientReceivables } from "./client-receivables";
import { InvoiceDialog, type InvoiceDialogTarget } from "./invoice-dialog";
import { InvoiceSheet } from "./invoice-sheet";
import { OpeningCard } from "./opening-card";
import {
  PartyInvoices,
  PartyPayments,
  PartyStatementTable,
} from "./party-lists";
import { money, PARTY_SCREENS, partyPaths } from "./party-money";
import {
  OpeningCardSkeleton,
  PartyCardsSkeleton,
  PartyStatementSkeleton,
} from "./parties-skeletons";

/**
 * One party's money on the Project (CM-705, CM-706; CM-708 reuses it for
 * Other Parties): balance, opening, invoices with status chips, payments
 * and the statement, with New invoice and Pay.
 */
export function PartyMoneyPage({
  projectId,
  partyType,
  partyId,
}: {
  projectId: string;
  partyType: PartyType;
  partyId: string;
}) {
  const { data: statement } = useSuspenseQuery(
    partyStatementQuery(projectId, partyType, partyId),
  );
  const access = useQuery(financeAccessQuery(projectId)).data;
  const canCreate =
    access != null && canInFinance(access, "finance.parties", "create");
  const screen = PARTY_SCREENS[partyType];
  const paths = partyPaths(projectId, partyType);
  const [invoiceTarget, setInvoiceTarget] =
    useState<InvoiceDialogTarget | null>(null);
  const [openInvoice, setOpenInvoice] = useState<string | null>(null);
  const balance = statement.closing;
  return (
    <div className="w-full space-y-6">
      <PageHeader
        back={{ label: screen.plural, href: paths.tab }}
        title={statement.party.name ?? screen.label}
        meta={
          <span className="text-sm">
            Balance{" "}
            <span className="font-semibold tabular-nums">
              {money(Math.abs(balance))}
            </span>{" "}
            {balance > 0
              ? "owed to the party"
              : balance < 0
                ? partyType === "client"
                  ? "owed by the Client"
                  : partyType === "other_party"
                    ? "owed to the Company or advanced"
                    : "advance with the party"
                : ""}
          </span>
        }
        actions={
          canCreate && (
            <div className="flex flex-wrap gap-2">
              {screen.flow === "in" ? null : (
                <Button
                  variant="outline"
                  onClick={() => {
                    setInvoiceTarget({ mode: "new", partyId });
                  }}
                >
                  <Plus aria-hidden="true" />
                  New invoice
                </Button>
              )}
              <Link
                href={paths.pay(
                  partyId,
                  screen.flow === "in" ? "in" : undefined,
                )}
                className={buttonVariants()}
              >
                {screen.flow === "in"
                  ? "Receive payment"
                  : partyType === "other_party"
                    ? "Record payment"
                    : "Pay"}
              </Link>
              {partyType === "other_party" && (
                <Link
                  href={paths.pay(partyId, "in")}
                  className={buttonVariants({ variant: "outline" })}
                >
                  Receive payment
                </Link>
              )}
            </div>
          )
        }
      />
      {partyType === "client" ? (
        <Suspense fallback={null}>
          <ClientReceivables projectId={projectId} partyId={partyId} />
        </Suspense>
      ) : null}
      <Suspense fallback={<OpeningCardSkeleton />}>
        <OpeningCard
          projectId={projectId}
          partyType={partyType}
          partyId={partyId}
        />
      </Suspense>
      <Tabs defaultValue="invoices" className="gap-4">
        <TabsList>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="statement">Statement</TabsTrigger>
        </TabsList>
        <TabsContent value="invoices">
          <Suspense fallback={<PartyCardsSkeleton label="Loading invoices" />}>
            <PartyInvoices
              projectId={projectId}
              partyType={partyType}
              partyId={partyId}
              onOpen={setOpenInvoice}
            />
          </Suspense>
        </TabsContent>
        <TabsContent value="payments">
          <Suspense fallback={<PartyCardsSkeleton label="Loading payments" />}>
            <PartyPayments
              projectId={projectId}
              partyType={partyType}
              partyId={partyId}
            />
          </Suspense>
        </TabsContent>
        <TabsContent value="statement">
          <Suspense fallback={<PartyStatementSkeleton />}>
            <PartyStatementTable
              projectId={projectId}
              partyType={partyType}
              partyId={partyId}
            />
          </Suspense>
        </TabsContent>
      </Tabs>
      <InvoiceDialog
        projectId={projectId}
        partyType={partyType}
        target={invoiceTarget}
        onOpenChange={(open) => {
          if (!open) setInvoiceTarget(null);
        }}
      />
      <InvoiceSheet
        projectId={projectId}
        partyType={partyType}
        invoiceId={openInvoice}
        onOpenChange={(open) => {
          if (!open) setOpenInvoice(null);
        }}
      />
    </div>
  );
}
