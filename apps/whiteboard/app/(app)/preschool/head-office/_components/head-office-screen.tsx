"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { Baby, Gauge, Percent, TriangleAlert, Wallet } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { MetricCard } from "@repo/ui/components/metric-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { TableCard } from "@/app/(app)/_components/table-card";
import { useIsMobile } from "@repo/ui/hooks/use-mobile";

import { useActiveCentre } from "@/app/(app)/preschool/_components/active-centre-provider";
import { PreschoolPage } from "@/app/(app)/preschool/_components/preschool-page";
import { formatPaiseAsRupees, paiseToRupees } from "@/lib/money";
import {
  preschoolHeadOfficeQueryOptions,
  type PreschoolHeadOffice,
} from "@/src/queries/preschool/dashboard";

import { MonthStepper, useReportMonth } from "./month-stepper";

type Row = PreschoolHeadOffice["centres"][number];

const HEAD = "text-xs tracking-wide uppercase";

function OwnershipBadge({ row }: { row: Row }) {
  return (
    <span className="flex flex-wrap gap-1">
      <Badge variant={row.ownership === "franchised" ? "secondary" : "outline"}>
        {row.ownership === "franchised" ? "Franchised" : "Company-owned"}
      </Badge>
      {row.status === "closed" ? (
        <Badge variant="destructive">Closed</Badge>
      ) : null}
    </span>
  );
}

function Occupancy({ row }: { row: Row }) {
  return (
    <div className="min-w-28 space-y-1">
      <p className="text-sm tabular-nums">
        {row.activeChildren} / {row.capacity}{" "}
        <span className="text-muted-foreground">({row.occupancyPercent}%)</span>
      </p>
      <div
        className="bg-muted h-1.5 overflow-hidden rounded-full"
        aria-hidden="true"
      >
        <div
          className="bg-primary h-full rounded-full"
          style={{ width: `${String(Math.min(100, row.occupancyPercent))}%` }}
        />
      </div>
    </div>
  );
}

function Money({ paise, alert = false }: { paise: number; alert?: boolean }) {
  return (
    <span
      className={
        alert && paise > 0
          ? "font-medium text-red-700 tabular-nums dark:text-red-400"
          : "tabular-nums"
      }
    >
      {formatPaiseAsRupees(paise)}
    </span>
  );
}

/**
 * Head Office: every Centre side by side for a month. Picking a Centre
 * makes it the active one and opens its dashboard.
 */
export function HeadOfficeScreen() {
  const router = useRouter();
  const isMobile = useIsMobile();
  const { setCentreId } = useActiveCentre();
  const { month, current, setMonth } = useReportMonth();
  const { data } = useSuspenseQuery(
    preschoolHeadOfficeQueryOptions(month === current ? undefined : month),
  );
  const open = (row: Row) => {
    setCentreId(row.id);
    router.push("/preschool");
  };
  const totals = data.totals;

  return (
    <PreschoolPage
      title="Head Office"
      meta={null}
      actions={
        <MonthStepper month={month} current={current} onChange={setMonth} />
      }
    >
      <section
        aria-label="Totals"
        className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5"
      >
        <MetricCard
          label="Children"
          icon={Baby}
          value={totals.activeChildren}
          unit={`/ ${String(totals.capacity)}`}
          caption={`${String(totals.presentToday)} present today`}
        />
        <MetricCard
          label="Occupancy"
          icon={Gauge}
          value={totals.occupancyPercent}
          unit="%"
          caption={`Across ${String(data.centres.length)} ${data.centres.length === 1 ? "Centre" : "Centres"}`}
        />
        <MetricCard
          label="Collected"
          icon={Wallet}
          value={paiseToRupees(totals.collectedPaise).toLocaleString("en-IN")}
          unit="₹"
          unitPlacement="start"
          caption="Fee Payments this month"
        />
        <MetricCard
          label="Overdue"
          icon={TriangleAlert}
          value={paiseToRupees(totals.overduePaise).toLocaleString("en-IN")}
          unit="₹"
          unitPlacement="start"
          badge={totals.overduePaise > 0 ? "Overdue" : undefined}
          badgeTone="warning"
          caption={`${formatPaiseAsRupees(totals.duePaise)} still owed today`}
        />
        <MetricCard
          label="Royalty due"
          icon={Percent}
          value={paiseToRupees(totals.royaltyDuePaise).toLocaleString("en-IN")}
          unit="₹"
          unitPlacement="start"
          caption="From Franchised Centres"
          render={
            <Link
              href={`/preschool/head-office/royalty${month === current ? "" : `?month=${month}`}`}
            />
          }
          className="col-span-2 lg:col-span-1"
        />
      </section>
      <p className="text-muted-foreground text-xs">
        Collected, Admissions and Royalty are for the month; Children, Present,
        Overdue and Enquiries are as of today.
      </p>
      {isMobile ? (
        <ul aria-label="Centres" className="space-y-3">
          {data.centres.map((row) => (
            <li
              key={row.id}
              className="bg-card space-y-3 rounded-xl border p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{row.name}</p>
                  <OwnershipBadge row={row} />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11"
                  aria-label={`Open ${row.name}`}
                  onClick={() => {
                    open(row);
                  }}
                >
                  Open
                </Button>
              </div>
              <Occupancy row={row} />
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Present today</dt>
                <dd className="text-right tabular-nums">{row.presentToday}</dd>
                <dt className="text-muted-foreground">Collected</dt>
                <dd className="text-right">
                  <Money paise={row.collectedPaise} />
                </dd>
                <dt className="text-muted-foreground">Overdue</dt>
                <dd className="text-right">
                  <Money paise={row.overduePaise} alert />
                </dd>
                <dt className="text-muted-foreground">Open Enquiries</dt>
                <dd className="text-right tabular-nums">{row.openEnquiries}</dd>
                <dt className="text-muted-foreground">Admissions</dt>
                <dd className="text-right tabular-nums">{row.admissions}</dd>
                <dt className="text-muted-foreground">Royalty due</dt>
                <dd className="text-right">
                  <Money paise={row.royaltyDuePaise} />
                </dd>
              </dl>
            </li>
          ))}
        </ul>
      ) : (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={`pl-4 ${HEAD}`}>Centre</TableHead>
                <TableHead className={HEAD}>Children</TableHead>
                <TableHead className={`text-right ${HEAD}`}>
                  Present today
                </TableHead>
                <TableHead className={`text-right ${HEAD}`}>
                  Collected
                </TableHead>
                <TableHead className={`text-right ${HEAD}`}>Overdue</TableHead>
                <TableHead className={`text-right ${HEAD}`}>
                  Open Enquiries
                </TableHead>
                <TableHead className={`text-right ${HEAD}`}>
                  Admissions
                </TableHead>
                <TableHead className={`pr-4 text-right ${HEAD}`}>
                  Royalty due
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.centres.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer"
                  onClick={() => {
                    open(row);
                  }}
                >
                  <TableCell className="pl-4">
                    <Button
                      type="button"
                      variant="link"
                      className="text-foreground h-auto p-0 font-semibold"
                      aria-label={`Open ${row.name}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        open(row);
                      }}
                    >
                      {row.name}
                    </Button>
                    <OwnershipBadge row={row} />
                  </TableCell>
                  <TableCell>
                    <Occupancy row={row} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.presentToday}
                  </TableCell>
                  <TableCell className="text-right">
                    <Money paise={row.collectedPaise} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Money paise={row.overduePaise} alert />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.openEnquiries}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.admissions}
                  </TableCell>
                  <TableCell className="pr-4 text-right">
                    {row.ownership === "franchised" ? (
                      <Money paise={row.royaltyDuePaise} />
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableCard>
      )}
    </PreschoolPage>
  );
}
