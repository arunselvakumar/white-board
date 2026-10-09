"use client";

import { useQuery } from "@tanstack/react-query";
import { HardHat, Handshake, IndianRupee, Wallet } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Skeleton } from "@repo/ui/components/skeleton";

import { formatPaise } from "@/components/money/money-input";
import {
  projectLabourSummaryQuery,
  type ProjectLabourSummary,
} from "@/src/queries/labour-summary";

const DAY = new Intl.DateTimeFormat("en-IN", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

function dayLabel(date: string): string {
  return DAY.format(new Date(`${date}T00:00:00Z`));
}

function Tile({
  icon,
  label,
  value,
  detail,
  href,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  detail: ReactNode;
  href?: string;
}) {
  const body = (
    <>
      <div className="text-muted-foreground flex items-center gap-2 text-sm">
        {icon}
        <span>{label}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-muted-foreground mt-1 text-xs">{detail}</p>
    </>
  );
  const className =
    "bg-card block rounded-xl border p-4 transition-colors" +
    (href == null
      ? ""
      : " hover:bg-accent/40 focus-visible:ring-2 outline-none");
  return href == null ? (
    <div className={className}>{body}</div>
  ) : (
    <Link href={href} className={className}>
      {body}
    </Link>
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
      <table className="sr-only">
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
  if (isPending)
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-28 rounded-xl" />
        ))}
      </div>
    );
  const { labourers, vendors } = data;
  const base = `/app/projects/${projectId}`;
  return (
    <section aria-labelledby="labour-today" className="space-y-3">
      <h2 id="labour-today" className="font-semibold">
        Labour today
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          icon={<HardHat className="size-4" />}
          label="Labours present"
          value={`${String(labourers.present + labourers.halfDay)} of ${String(labourers.onProject)}`}
          detail={
            labourers.unmarked > 0
              ? `${String(labourers.unmarked)} not marked yet`
              : `${String(labourers.halfDay)} half day, ${String(labourers.absent)} absent`
          }
          href={`${base}/attendance/labour`}
        />
        <Tile
          icon={<Handshake className="size-4" />}
          label="Vendor heads"
          value={vendors.headcountToday}
          detail={`${String(vendors.recordedToday)} of ${String(vendors.assigned)} vendors recorded`}
          href={`${base}/attendance/vendors`}
        />
        <Tile
          icon={<Wallet className="size-4" />}
          label="Owed to Labours"
          value={
            data.labourBalance == null
              ? "—"
              : formatPaise(data.labourBalance.toPay)
          }
          detail={balanceDetail(data.labourBalance)}
          href={`${base}/payments`}
        />
        <Tile
          icon={<IndianRupee className="size-4" />}
          label="Owed to vendors"
          value={
            data.vendorBalance == null
              ? "—"
              : formatPaise(data.vendorBalance.toPay)
          }
          detail={balanceDetail(data.vendorBalance)}
          href={`${base}/payments`}
        />
        <PresentChart series={data.presentSeries} />
      </div>
    </section>
  );
}
