"use client";

import {
  CalendarCheckIcon,
  ChartLineUpIcon,
  CurrencyInrIcon,
  NotebookIcon,
} from "@phosphor-icons/react/ssr";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import { Badge } from "@repo/ui/components/badge";
import { buttonVariants } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Skeleton } from "@repo/ui/components/skeleton";

import { formatDate } from "@/app/(app)/preschool/_components/preschool-format";
import { todayInIndia } from "@/src/preschool/domain/dates";
import {
  PRESCHOOL_ATTENDANCE_STATUS_LABELS,
  preschoolChildAttendanceQueryOptions,
} from "@/src/queries/preschool/attendance";
import type { PreschoolChildProfile } from "@/src/queries/preschool/children";
import {
  PRESCHOOL_ATE_LABELS,
  PRESCHOOL_MEAL_LABELS,
  PRESCHOOL_MOOD_LABELS,
  preschoolChildDailyReportsQueryOptions,
} from "@/src/queries/preschool/daily-reports";
import type { PreschoolRole } from "@/src/queries/preschool/me";
import { preschoolObservationsQueryOptions } from "@/src/queries/preschool/observations";
import { preschoolChildProgressReportsQueryOptions } from "@/src/queries/preschool/progress-reports";

/** A card in the Child page's side column. */
export type OverviewCard = { key: string; node: ReactNode };

function SideCard({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  children: ReactNode;
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>
          <h2 className="flex items-center gap-2">
            <Icon aria-hidden className="size-4" />
            {title}
          </h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">{children}</CardContent>
    </Card>
  );
}

function Quiet({ children }: { children: ReactNode }) {
  return <p className="text-muted-foreground">{children}</p>;
}

function AttendanceCard({ childId }: { childId: string }) {
  const today = todayInIndia(new Date());
  const { data, isPending, isError } = useQuery(
    preschoolChildAttendanceQueryOptions(childId, today.slice(0, 7)),
  );
  const day = data?.days.find((entry) => entry.date === today);
  return (
    <SideCard title="Attendance this month" icon={CalendarCheckIcon}>
      {isPending ? (
        <Skeleton className="h-12 w-full" />
      ) : isError ? (
        <Quiet>Attendance could not be loaded.</Quiet>
      ) : (
        <>
          <dl className="grid grid-cols-3 gap-2">
            {(["present", "absent", "leave"] as const).map((status) => (
              <div key={status}>
                <dt className="text-muted-foreground text-xs">
                  {PRESCHOOL_ATTENDANCE_STATUS_LABELS[status]}
                </dt>
                <dd className="text-lg font-semibold tabular-nums">
                  {data.totals[status]}
                </dd>
              </div>
            ))}
          </dl>
          <p>
            Today:{" "}
            {day?.status == null ? (
              <span className="text-muted-foreground">not marked yet</span>
            ) : (
              <>
                {PRESCHOOL_ATTENDANCE_STATUS_LABELS[day.status]}
                {day.checkInTime == null ? null : `, in ${day.checkInTime}`}
                {day.checkOutTime == null
                  ? null
                  : `, out ${day.checkOutTime}${day.collectedByName == null ? "" : ` with ${day.collectedByName}`}`}
              </>
            )}
          </p>
        </>
      )}
    </SideCard>
  );
}

function excerpt(text: string, length = 120): string {
  return text.length <= length
    ? text
    : `${text.slice(0, length - 1).trimEnd()}…`;
}

function DailyReportCard({ childId }: { childId: string }) {
  const { data, isPending, isError } = useQuery(
    preschoolChildDailyReportsQueryOptions(childId, undefined, 1),
  );
  const report = data?.items[0];
  return (
    <SideCard title="Latest Daily Report" icon={NotebookIcon}>
      {isPending ? (
        <Skeleton className="h-12 w-full" />
      ) : isError ? (
        <Quiet>Daily Reports could not be loaded.</Quiet>
      ) : report == null ? (
        <Quiet>No Daily Report yet.</Quiet>
      ) : (
        <>
          <p className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{formatDate(report.date)}</span>
            <Badge
              variant={report.status === "published" ? "secondary" : "outline"}
            >
              {report.status === "published" ? "Published" : "Draft"}
            </Badge>
          </p>
          {report.mood == null ? null : (
            <p>Mood: {PRESCHOOL_MOOD_LABELS[report.mood]}</p>
          )}
          {report.meals.length === 0 ? null : (
            <p>
              {report.meals
                .map(
                  (meal) =>
                    `${PRESCHOOL_MEAL_LABELS[meal.meal]}: ${PRESCHOOL_ATE_LABELS[meal.ate].toLowerCase()}`,
                )
                .join(" · ")}
            </p>
          )}
          {report.note == null ? null : (
            <p className="text-muted-foreground">{excerpt(report.note)}</p>
          )}
        </>
      )}
    </SideCard>
  );
}

function ProgressCard({ childId }: { childId: string }) {
  const reports = useQuery(preschoolChildProgressReportsQueryOptions(childId));
  const observations = useQuery(
    preschoolObservationsQueryOptions({ childId, limit: 1 }),
  );
  const latestYear = reports.data?.items[0]?.academicYearId;
  const thisYear = (reports.data?.items ?? [])
    .filter((item) => item.academicYearId === latestYear)
    .sort((a, b) => a.term.term.localeCompare(b.term.term));
  return (
    <SideCard title="Progress" icon={ChartLineUpIcon}>
      {reports.isPending || observations.isPending ? (
        <Skeleton className="h-12 w-full" />
      ) : reports.isError ? (
        <Quiet>Progress could not be loaded.</Quiet>
      ) : (
        <>
          <p>
            {observations.data?.total ?? 0} Observation
            {observations.data?.total === 1 ? "" : "s"}
          </p>
          {thisYear.length === 0 ? (
            <Quiet>No Progress Report yet.</Quiet>
          ) : (
            <ul className="space-y-1">
              {thisYear.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-2"
                >
                  <Link
                    href={`/preschool/progress/reports/${item.id}`}
                    className="underline-offset-4 hover:underline"
                  >
                    {item.term.label}, {item.academicYearName}
                  </Link>
                  <Badge
                    variant={
                      item.status === "published" ? "secondary" : "outline"
                    }
                  >
                    {item.status === "published" ? "Published" : "Draft"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </SideCard>
  );
}

function FeesCard({ child }: { child: PreschoolChildProfile }) {
  return (
    <SideCard title="Fees" icon={CurrencyInrIcon}>
      <Quiet>Invoices, Fee Payments and Receipts for {child.firstName}.</Quiet>
      <Link
        href={`/preschool/fees/children/${child.id}`}
        className={buttonVariants({ variant: "outline", size: "sm" })}
      >
        Open fees
      </Link>
    </SideCard>
  );
}

/**
 * The Child page's side column, in order. Each area adds its card here; a
 * card that has nothing to show says so quietly instead of disappearing.
 */
export function overviewCards(
  child: PreschoolChildProfile,
  role: PreschoolRole,
): OverviewCard[] {
  const manager = role === "owner" || role === "centre_head";
  const staff = manager || role === "teacher";
  const cards: OverviewCard[] = [];
  if (staff)
    cards.push(
      { key: "attendance", node: <AttendanceCard childId={child.id} /> },
      { key: "daily-report", node: <DailyReportCard childId={child.id} /> },
      { key: "progress", node: <ProgressCard childId={child.id} /> },
    );
  if (manager) cards.push({ key: "fees", node: <FeesCard child={child} /> });
  return cards;
}
