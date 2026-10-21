"use client";

import { useQuery } from "@tanstack/react-query";
import {
  HardHat,
  Handshake,
  IndianRupee,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { MetricCard } from "@repo/ui/components/metric-card";

import { formatPaise } from "@/components/money/money-input";
import {
  projectLabourSummaryQuery,
  type ProjectLabourSummary,
} from "@/src/queries/labour-summary";

import { ProjectLabourTilesSkeleton } from "./projects-skeletons";

const DAY = new Intl.DateTimeFormat("en-IN", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

function dayLabel(date: string): string {
  return DAY.format(new Date(`${date}T00:00:00Z`));
}

/**
 * An amount without its `₹`, which the tile shows as a grey unit, and
 * without `.00` on whole rupees so the figure stays large.
 */
function rupeeFigure(paise: number): string {
  return formatPaise(paise).replace("₹", "").replace(/\.00$/, "");
}

function Tile({
  icon,
  label,
  value,
  unit,
  unitPlacement,
  detail,
  href,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  unit?: string;
  unitPlacement?: "start" | "end";
  detail: ReactNode;
  href?: string;
}) {
  return (
    <MetricCard
      label={label}
      icon={icon}
      value={value}
      unit={unit}
      unitPlacement={unitPlacement}
      caption={detail}
      render={href == null ? undefined : <Link href={href} />}
    />
  );
}

/**
 * "Labours present at site" for the last 14 days: one series (labourers
 * Present or Half Day), so no legend; hover or focus a bar for the day.
 */
function PresentChart({
  series,
}: {
  series: ProjectLabourSummary["presentSeries"];
}) {
  const [active, setActive] = useState(series.length - 1);
  const max = Math.max(1, ...series.map((day) => day.present));
  const shown = series[active] ?? series.at(-1);
  return (
    <section
      aria-labelledby="present-chart"
      className="bg-card rounded-xl border p-4 sm:col-span-2 lg:col-span-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="present-chart" className="text-sm font-semibold">
          Labours present, last 14 days
        </h3>
        {shown != null && (
          <p className="text-muted-foreground text-xs" aria-live="polite">
            {dayLabel(shown.date)}: {shown.present} present
            {shown.vendorHeadcount > 0
              ? `, ${String(shown.vendorHeadcount)} vendor heads`
              : ""}
          </p>
        )}
      </div>
      <div
        className="mt-4 flex h-28 items-end gap-0.5 border-b"
        aria-hidden="true"
        onMouseLeave={() => {
          setActive(series.length - 1);
        }}
      >
        {series.map((day, index) => (
          <div
            key={day.date}
            className="flex h-full flex-1 items-end"
            onMouseEnter={() => {
              setActive(index);
            }}
          >
            <div
              className={
                "w-full rounded-t-[4px] transition-colors " +
                (index === active ? "bg-primary" : "bg-primary/55")
              }
              style={{
                height: `${String(Math.max(day.present === 0 ? 0 : 4, (day.present / max) * 100))}%`,
              }}
            />
          </div>
        ))}
      </div>
      <div
        className="text-muted-foreground mt-1 flex justify-between text-[0.7rem]"
        aria-hidden="true"
      >
        <span>{series[0] == null ? "" : dayLabel(series[0].date)}</span>
        <span>Today</span>
      </div>
      <div className="sr-only">
        <table>
          <caption>Labours present and vendor heads per day</caption>
          <thead>
            <tr>
              <th scope="col">Day</th>
              <th scope="col">Labourers present</th>
              <th scope="col">Vendor heads</th>
            </tr>
          </thead>
          <tbody>
            {series.map((day) => (
              <tr key={day.date}>
                <th scope="row">{dayLabel(day.date)}</th>
                <td>{day.present}</td>
                <td>{day.vendorHeadcount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function balanceDetail(
  balance: ProjectLabourSummary["labourBalance"],
): ReactNode {
  if (balance == null) return "Needs the Financial permission";
  return balance.advanced > 0
    ? `${formatPaise(balance.advanced)} advanced ahead of wages`
    : "Nothing advanced";
}

/**
 * The labour tiles on a Project's Overview (CM-219): who is on site
 * today, vendor headcount, the last two weeks, and labour and vendor
 * payment status. Hidden for Team Members who cannot read attendance.
 */
export function ProjectLabourTiles({ projectId }: { projectId: string }) {
  const { data, isPending, isError } = useQuery(
    projectLabourSummaryQuery(projectId),
  );
  if (isError) return null;
  if (isPending) return <ProjectLabourTilesSkeleton />;
  const { labourers, vendors } = data;
  const base = `/app/projects/${projectId}`;
  return (
    <section aria-labelledby="labour-today" className="space-y-3">
      <h2 id="labour-today" className="font-semibold">
        Labour today
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          icon={HardHat}
          label="Labours present"
          value={labourers.present + labourers.halfDay}
          unit={`/${String(labourers.onProject)}`}
          detail={
            labourers.unmarked > 0
              ? `${String(labourers.unmarked)} not marked yet`
              : `${String(labourers.halfDay)} half day, ${String(labourers.absent)} absent`
          }
          href={`${base}/attendance/labour`}
        />
        <Tile
          icon={Handshake}
          label="Vendor heads"
          value={vendors.headcountToday}
          detail={`${String(vendors.recordedToday)} of ${String(vendors.assigned)} vendors recorded`}
          href={`${base}/attendance/vendors`}
        />
        <Tile
          icon={Wallet}
          label="Owed to Labours"
          value={
            data.labourBalance == null
              ? "—"
              : rupeeFigure(data.labourBalance.toPay)
          }
          unit={data.labourBalance == null ? undefined : "₹"}
          unitPlacement="start"
          detail={balanceDetail(data.labourBalance)}
          href={`${base}/payments/wages`}
        />
        <Tile
          icon={IndianRupee}
          label="Owed to vendors"
          value={
            data.vendorBalance == null
              ? "—"
              : rupeeFigure(data.vendorBalance.toPay)
          }
          unit={data.vendorBalance == null ? undefined : "₹"}
          unitPlacement="start"
          detail={balanceDetail(data.vendorBalance)}
          href={`${base}/payments/wages`}
        />
        <PresentChart series={data.presentSeries} />
      </div>
    </section>
  );
}
