"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { Scale } from "lucide-react";
import { Suspense, useState } from "react";
import { Button } from "@repo/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@repo/ui/components/sheet";
import { cn } from "@repo/ui/lib/utils";

import { PageHeader } from "@/components/app-shell/page-header";
import {
  workspacePartyBalancesQuery,
  type PartyType,
} from "@/src/queries/finance-parties";

import { PartyStatementTable } from "./party-lists";
import { money } from "./party-money";
import {
  PartyBalancesWorkspaceSkeleton,
  PartyStatementSkeleton,
} from "./parties-skeletons";

type StatementTarget = {
  partyId: string;
  partyName: string | null;
  projectId: string;
  projectName: string | null;
};

/** "₹7,000.00 owed to the Company", "₹3,000.00 owed by the Company" or "Settled". */
export function balanceWords(balance: number): string {
  if (balance > 0) return `${money(balance)} owed by the Company`;
  if (balance < 0) return `${money(-balance)} owed to the Company`;
  return "Nothing due";
}

/**
 * Workspace → **Party Balance** (CM-708, ADR CM-0017 §11): each Other
 * Party's balance across the Projects you can see, split by Project; a
 * Project opens the party's statement there.
 */
export function PartyBalanceWorkspace({
  partyType = "other_party",
}: {
  partyType?: PartyType;
}) {
  return (
    <div className="w-full space-y-6 p-6">
      <PageHeader title="Party Balance" />
      <p className="text-muted-foreground max-w-3xl text-sm">
        What each Other Party owes the Company, or is owed, across Projects. You
        see the Projects where you can view Parties.
      </p>
      <Suspense fallback={<PartyBalancesWorkspaceSkeleton />}>
        <Balances partyType={partyType} />
      </Suspense>
    </div>
  );
}

function Balances({ partyType }: { partyType: PartyType }) {
  const { data } = useSuspenseQuery(workspacePartyBalancesQuery(partyType));
  const [statement, setStatement] = useState<StatementTarget | null>(null);
  const [shown, setShown] = useState<StatementTarget | null>(null);
  if (statement != null && statement !== shown) setShown(statement);
  const target = statement ?? shown;

  if (data.items.length === 0)
    return (
      <Empty className="bg-card border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Scale />
          </EmptyMedia>
          <EmptyTitle>No Other Parties yet</EmptyTitle>
          <EmptyDescription>
            Add Other Parties under Masters → Other Party and put them on
            Projects; their invoices and payments show here.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );

  return (
    <div className="space-y-4">
      <dl className="grid gap-3 sm:grid-cols-3">
        <div className="bg-card rounded-lg border p-3">
          <dt className="text-muted-foreground text-xs">Owed by the Company</dt>
          <dd className="font-semibold tabular-nums">
            {money(data.totals.owedByCompany)}
          </dd>
        </div>
        <div className="bg-card rounded-lg border p-3">
          <dt className="text-muted-foreground text-xs">Owed to the Company</dt>
          <dd className="font-semibold tabular-nums">
            {money(data.totals.owedToCompany)}
          </dd>
        </div>
        <div className="bg-card rounded-lg border p-3">
          <dt className="text-muted-foreground text-xs">Net</dt>
          <dd className="font-semibold tabular-nums">
            {balanceWords(data.totals.net)}
          </dd>
        </div>
      </dl>
      <ul aria-label="Party balances" className="space-y-3">
        {data.items.map((item) => (
          <li key={item.party.id} className="bg-card rounded-lg border p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="min-w-0 font-medium break-words">
                {item.party.name ?? "A removed party"}
              </p>
              <p
                className={cn(
                  "shrink-0 text-sm font-semibold tabular-nums",
                  item.balance < 0 && "text-amber-700 dark:text-amber-300",
                )}
              >
                {balanceWords(item.balance)}
              </p>
            </div>
            {item.projects.length === 0 ? (
              <p className="text-muted-foreground mt-1 text-sm">
                Not on any Project yet.
              </p>
            ) : (
              <ul
                aria-label={`${item.party.name ?? "Party"} by Project`}
                className="bg-card mt-2 divide-y rounded-md border"
              >
                {item.projects.map((project) => (
                  <li
                    key={project.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 truncate">
                      {project.name ?? "A removed Project"}
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="tabular-nums">
                        {money(project.balance)}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        aria-label={`Statement of ${item.party.name ?? "the party"} on ${project.name ?? "the Project"}`}
                        onClick={() => {
                          setStatement({
                            partyId: item.party.id,
                            partyName: item.party.name,
                            projectId: project.id,
                            projectName: project.name,
                          });
                        }}
                      >
                        Statement
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      <Sheet
        open={statement != null}
        onOpenChange={(open) => {
          if (!open) setStatement(null);
        }}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{target?.partyName ?? "Statement"}</SheetTitle>
            <SheetDescription>
              Statement on {target?.projectName ?? "the Project"}
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">
            {statement != null && (
              <Suspense fallback={<PartyStatementSkeleton />}>
                <PartyStatementTable
                  projectId={statement.projectId}
                  partyType={partyType}
                  partyId={statement.partyId}
                />
              </Suspense>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
