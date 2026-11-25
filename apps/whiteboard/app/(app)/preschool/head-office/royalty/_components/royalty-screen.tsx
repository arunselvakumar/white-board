"use client";

import { BuildingsIcon } from "@phosphor-icons/react/ssr";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ChevronDown, FileText } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { EmptyState } from "@repo/ui/components/empty-state";
import { cn } from "@repo/ui/lib/utils";

import {
  MonthStepper,
  formatMonth,
  useReportMonth,
} from "@/app/(app)/preschool/head-office/_components/month-stepper";
import { PreschoolPage } from "@/app/(app)/preschool/_components/preschool-page";
import { formatPaiseAsRupees } from "@/lib/money";
import {
  preschoolRoyaltyQueryOptions,
  type PreschoolRoyaltyStatement,
} from "@/src/queries/preschool/royalty";

type CentreRow = PreschoolRoyaltyStatement["centres"][number];

function Figure({
  label,
  paise,
  strong = false,
}: {
  label: string;
  paise: number;
  strong?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd
        className={cn(
          "tabular-nums",
          strong ? "text-xl font-semibold" : "font-medium",
        )}
      >
        {formatPaiseAsRupees(paise)}
      </dd>
    </div>
  );
}

function CentreCard({ centre, month }: { centre: CentreRow; month: string }) {
  const [open, setOpen] = useState(false);
  const panelId = `royalty-${centre.centreId}`;
  return (
    <li className="bg-card space-y-4 rounded-xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold">{centre.name}</h2>
          <p className="text-muted-foreground text-sm">
            {centre.franchiseeName ?? "Franchisee not recorded"} ·{" "}
            <Badge variant="secondary">{centre.royaltyPercent}% royalty</Badge>
          </p>
        </div>
        <Button
          variant="outline"
          className="h-11"
          render={
            <Link
              href={`/preschool/head-office/royalty/${centre.centreId}?month=${month}`}
            />
          }
        >
          <FileText aria-hidden="true" />
          View statement
        </Button>
      </div>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Figure
          label="Royalty-bearing collections"
          paise={centre.royaltyBearingPaise}
        />
        <Figure label="Other collections" paise={centre.otherPaise} />
        <Figure label="Royalty due" paise={centre.royaltyPaise} strong />
      </dl>
      <div>
        <Button
          type="button"
          variant="ghost"
          className="h-11 px-2"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => {
            setOpen(!open);
          }}
        >
          By Fee Head
          <ChevronDown
            aria-hidden="true"
            className={cn("transition-transform", open && "rotate-180")}
          />
        </Button>
        {open ? (
          <div id={panelId} className="mt-2">
            {centre.byFeeHead.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No Fee Payments this month.
              </p>
            ) : (
              <ul
                aria-label={`Collections by Fee Head at ${centre.name}`}
                className="divide-y rounded-lg border"
              >
                {centre.byFeeHead.map((head) => (
                  <li
                    key={head.feeHeadId}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                  >
                    <span className="min-w-0">
                      {head.name}{" "}
                      {head.royaltyBearing ? (
                        <Badge variant="outline">Royalty-bearing</Badge>
                      ) : null}
                    </span>
                    <span className="tabular-nums">
                      {formatPaiseAsRupees(head.collectedPaise)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>
    </li>
  );
}

/** The month's Royalty Statement: one card per Franchised Centre (Owner). */
export function RoyaltyScreen() {
  const { month, current, setMonth } = useReportMonth();
  const { data } = useSuspenseQuery(preschoolRoyaltyQueryOptions(month));

  return (
    <PreschoolPage
      title="Royalty Statement"
      watermark="Royalty"
      meta={formatMonth(month)}
      actions={
        <MonthStepper month={month} current={current} onChange={setMonth} />
      }
    >
      {data.centres.length === 0 ? (
        <EmptyState
          className="border"
          icon={BuildingsIcon}
          tone="green"
          title="No Franchised Centres"
          description="Royalty applies to Franchised Centres. Record a franchisee and Royalty % under a Centre's ownership."
          actions={
            <Button render={<Link href="/preschool/centres" />}>
              Open Centres
            </Button>
          }
        />
      ) : (
        <>
          <dl
            aria-label="Totals"
            className="bg-muted/40 grid grid-cols-2 gap-3 rounded-xl border p-4 sm:grid-cols-3"
          >
            <Figure
              label="Royalty-bearing collections"
              paise={data.totals.royaltyBearingPaise}
            />
            <Figure label="Other collections" paise={data.totals.otherPaise} />
            <Figure
              label="Royalty due"
              paise={data.totals.royaltyPaise}
              strong
            />
          </dl>
          <ul className="grid gap-4 xl:grid-cols-2">
            {data.centres.map((centre) => (
              <CentreCard key={centre.centreId} centre={centre} month={month} />
            ))}
          </ul>
          <p className="text-muted-foreground text-xs">
            Computed from Fee Payments received in {formatMonth(month)} on
            royalty-bearing Fee Heads. This is a statement, not an invoice.
          </p>
        </>
      )}
    </PreschoolPage>
  );
}
