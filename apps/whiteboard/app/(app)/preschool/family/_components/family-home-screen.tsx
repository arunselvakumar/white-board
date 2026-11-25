"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { ArrowRight, Phone } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { cn } from "@repo/ui/lib/utils";

import { formatClockTime } from "@/app/(app)/preschool/_components/preschool-format";
import { formatPaiseAsRupees } from "@/lib/money";
import {
  preschoolFamilyHomeQueryOptions,
  type PreschoolFamilyChild,
} from "@/src/queries/preschool/family";

import { DailyReportSummary } from "./daily-report-summary";
import { dayLabel, shortDate } from "./family-format";
import { FamilyPage } from "./family-page";

function HomeCard({
  title,
  link,
  children,
}: {
  title: string;
  link?: { href: string; label: string };
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{title}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {children}
        {link == null ? null : (
          <Button
            variant="ghost"
            className="-ml-2 h-11"
            render={<Link href={link.href} />}
          >
            {link.label}
            <ArrowRight aria-hidden="true" />
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

/** "Aarav is at school — checked in 9:05 am", "Absent today", … */
export function todayLine(entry: PreschoolFamilyChild): {
  text: string;
  tone: "good" | "calm" | "away";
} {
  const name = entry.child.firstName;
  const { status, checkInTime, checkOutTime, collectedBy } = entry.today;
  if (status === "present" && checkOutTime != null)
    return {
      text: `Collected at ${formatClockTime(checkOutTime)}${
        collectedBy == null
          ? ""
          : ` by ${collectedBy.name}${collectedBy.relationship == null ? "" : ` (${collectedBy.relationship})`}`
      }`,
      tone: "calm",
    };
  if (status === "present")
    return {
      text:
        checkInTime == null
          ? `${name} is at school`
          : `${name} is at school — checked in ${formatClockTime(checkInTime)}`,
      tone: "good",
    };
  if (status === "absent") return { text: "Absent today", tone: "away" };
  if (status === "leave") return { text: "On leave today", tone: "away" };
  return { text: "Not marked yet", tone: "away" };
}

/** "₹50,500 overdue — please pay at the Centre", "₹18,000 due by 1 Dec", … */
export function feesLine(fees: PreschoolFamilyChild["fees"]): {
  text: string;
  detail: string | null;
  overdue: boolean;
} {
  if (fees.overduePaise > 0)
    return {
      text: `${formatPaiseAsRupees(fees.overduePaise)} overdue — please pay at the Centre`,
      detail:
        fees.nextDue == null
          ? null
          : `Then ${formatPaiseAsRupees(fees.nextDue.duePaise)} for ${fees.nextDue.label} by ${shortDate(fees.nextDue.dueOn)}`,
      overdue: true,
    };
  if (fees.nextDue != null)
    return {
      text: `${formatPaiseAsRupees(fees.nextDue.duePaise)} due by ${shortDate(fees.nextDue.dueOn)}`,
      detail: fees.nextDue.label,
      overdue: false,
    };
  if (fees.duePaise > 0)
    return {
      text: `${formatPaiseAsRupees(fees.duePaise)} due`,
      detail: null,
      overdue: false,
    };
  return {
    text: "Nothing due right now. Thank you!",
    detail: null,
    overdue: false,
  };
}

function ChildHome({
  entry,
  date,
  childQuery,
}: {
  entry: PreschoolFamilyChild;
  date: string;
  childQuery: string;
}) {
  const { child, classTeachers, latestDailyReport: report } = entry;
  const today = todayLine(entry);
  const fees = feesLine(entry.fees);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <HomeCard title="Today">
        <p
          className={cn(
            "text-lg font-semibold",
            today.tone === "good" && "text-emerald-700 dark:text-emerald-400",
            today.tone === "away" && "text-muted-foreground",
          )}
        >
          {today.text}
        </p>
        <p className="text-sm">
          {child.classroomName ?? "No Classroom yet"}
          {classTeachers.length === 0
            ? ""
            : ` · Class Teacher${classTeachers.length === 1 ? "" : "s"}: ${classTeachers.join(", ")}`}
        </p>
        <div className="flex flex-wrap gap-2">
          {child.centre.phone == null ? null : (
            <Button
              variant="outline"
              className="h-11"
              render={<Link href={`tel:${child.centre.phone}`} />}
            >
              <Phone aria-hidden="true" />
              Call {child.centre.name}
            </Button>
          )}
          <Button
            variant="ghost"
            className="h-11"
            render={<Link href={`/preschool/family/child${childQuery}`} />}
          >
            {child.firstName}&apos;s details and pickups
          </Button>
        </div>
      </HomeCard>

      <HomeCard
        title={
          report == null
            ? "Daily Report"
            : report.date === date
              ? "Today's Daily Report"
              : `Daily Report · ${dayLabel(report.date)}`
        }
        link={{
          href: `/preschool/family/daily-reports${childQuery}`,
          label: "See earlier reports",
        }}
      >
        {report == null ? (
          <p className="text-muted-foreground text-sm">
            No Daily Report yet. The Teacher sends one at the end of the day.
          </p>
        ) : (
          <DailyReportSummary report={report} firstName={child.firstName} />
        )}
      </HomeCard>

      <HomeCard
        title="Fees"
        link={{
          href: `/preschool/family/fees${childQuery}`,
          label: "View details",
        }}
      >
        <p
          className={cn(
            "font-semibold",
            fees.overdue && "text-amber-800 dark:text-amber-300",
          )}
        >
          {fees.text}
        </p>
        {fees.detail == null ? null : (
          <p className="text-muted-foreground text-sm">{fees.detail}</p>
        )}
      </HomeCard>

      {/* Announcements and Progress Report cards go here once Parents can read them. */}
    </div>
  );
}

/** The Parent Home: the chosen Child's day, latest report and fees. */
export function FamilyHomeScreen() {
  const { data } = useSuspenseQuery(preschoolFamilyHomeQueryOptions());
  return (
    <FamilyPage title={(child) => `${child.firstName}'s day`}>
      {(child, childQuery) => {
        const entry = data.children.find((each) => each.child.id === child.id);
        return entry == null ? (
          <p className="text-muted-foreground text-sm">
            {child.firstName}&apos;s day is not available yet.
          </p>
        ) : (
          <ChildHome entry={entry} date={data.date} childQuery={childQuery} />
        );
      }}
    </FamilyPage>
  );
}
