"use client";

import {
  CheckCircle2,
  Circle,
  ArrowRight,
  Baby,
  CalendarCheck,
  Inbox,
  Wallet,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { MetricCard } from "@repo/ui/components/metric-card";
import { cn } from "@repo/ui/lib/utils";

import { PreschoolPage } from "@/app/(app)/preschool/_components/preschool-page";
import { SeatsMeter } from "@/app/(app)/preschool/_components/seats-meter";
import { formatPaiseAsRupees, paiseToRupees } from "@/lib/money";
import type { PreschoolCentreDashboard } from "@/src/queries/preschool/dashboard";

/** "28 Nov" */
function shortDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function rupees(paise: number): string {
  return paiseToRupees(paise).toLocaleString("en-IN");
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>
          <h2>{title}</h2>
        </CardTitle>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

const STEPS = [
  {
    key: "hasClassrooms",
    title: "Add Classrooms",
    detail: "A Classroom for each section of a Programme, with seats.",
    href: "/preschool/classrooms",
  },
  {
    key: "hasStaff",
    title: "Add Staff",
    detail: "The Centre Head, Teachers and helpers.",
    href: "/preschool/staff",
  },
  {
    key: "hasFeeStructure",
    title: "Set the Fee Structure",
    detail: "What each Programme costs this Academic Year.",
    href: "/preschool/fees/structures",
  },
  {
    key: "hasChildren",
    title: "Admit the first Child",
    detail: "From an Enquiry or straight from the Children list.",
    href: "/preschool/children",
  },
] as const;

/** A new Centre's four first steps, each ticked once done. */
export function GetStarted({
  setup,
}: {
  setup: PreschoolCentreDashboard["setup"];
}) {
  const done = STEPS.filter((step) => setup[step.key]).length;
  return (
    <Section title="Get started">
      <p className="text-muted-foreground mb-3 text-sm">
        {done} of {STEPS.length} done. The dashboard fills in as the Centre
        runs.
      </p>
      <ol className="space-y-2">
        {STEPS.map((step, index) => {
          const ticked = setup[step.key];
          return (
            <li
              key={step.key}
              className="flex flex-wrap items-center gap-3 rounded-xl border p-3"
            >
              {ticked ? (
                <CheckCircle2
                  aria-hidden="true"
                  className="size-6 shrink-0 text-emerald-600 dark:text-emerald-400"
                />
              ) : (
                <Circle
                  aria-hidden="true"
                  className="text-muted-foreground size-6 shrink-0"
                />
              )}
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "font-medium",
                    ticked && "text-muted-foreground line-through",
                  )}
                >
                  {index + 1}. {step.title}
                  <span className="sr-only">
                    {ticked ? " (done)" : " (to do)"}
                  </span>
                </p>
                <p className="text-muted-foreground text-sm">{step.detail}</p>
              </div>
              {ticked ? null : (
                <Button
                  variant="outline"
                  className="h-11"
                  render={<Link href={step.href} />}
                >
                  {step.title}
                  <ArrowRight aria-hidden="true" />
                </Button>
              )}
            </li>
          );
        })}
      </ol>
    </Section>
  );
}

function TodaySection({ data }: { data: PreschoolCentreDashboard }) {
  const present = data.attendanceToday.present;
  const reports = data.dailyReportsToday;
  return (
    <Section
      title="Today"
      action={
        <Button
          variant="ghost"
          className="h-11"
          render={<Link href="/preschool/attendance" />}
        >
          Attendance
          <ArrowRight aria-hidden="true" />
        </Button>
      }
    >
      <ul aria-label="Attendance by Classroom" className="space-y-3">
        {data.children.classrooms.map((room) => {
          const notMarked = room.childCount > 0 && room.marked === 0;
          const percent =
            room.childCount === 0
              ? 0
              : Math.round((room.present / room.childCount) * 100);
          return (
            <li key={room.id} className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="min-w-0 truncate font-medium">
                  {room.name}
                </span>
                {notMarked ? (
                  <Link
                    href={`/preschool/attendance?classroomId=${room.id}`}
                    className="text-amber-700 underline-offset-4 hover:underline dark:text-amber-400"
                  >
                    Not marked yet
                  </Link>
                ) : (
                  <span className="text-muted-foreground tabular-nums">
                    {room.present} / {room.childCount} present
                  </span>
                )}
              </div>
              <div
                className="bg-muted h-1.5 overflow-hidden rounded-full"
                aria-hidden="true"
              >
                <div
                  className="bg-primary h-full rounded-full"
                  style={{ width: `${percent}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 border-t pt-3 text-sm">
        <Link
          href="/preschool/daily-reports"
          className="hover:text-primary underline-offset-4 hover:underline"
        >
          Daily Reports sent:{" "}
          <span className="font-medium tabular-nums">
            {reports.published} / {present}
          </span>
        </Link>
        {reports.draft > 0 ? (
          <span className="text-muted-foreground">
            {" "}
            · {reports.draft} in draft
          </span>
        ) : null}
      </p>
    </Section>
  );
}

function AttentionList({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className="space-y-1.5">
      <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {title}
      </h3>
      <ul className="divide-y rounded-lg border">{children}</ul>
    </section>
  );
}

function AttentionRow({
  href,
  primary,
  secondary,
}: {
  href: string;
  primary: ReactNode;
  secondary: ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        className="hover:bg-muted/60 focus-visible:ring-ring/50 flex min-h-12 items-center justify-between gap-3 px-3 py-2 text-sm outline-none focus-visible:ring-3"
      >
        <span className="min-w-0 truncate">{primary}</span>
        <span className="text-muted-foreground shrink-0 text-right">
          {secondary}
        </span>
      </Link>
    </li>
  );
}

function NeedsAttention({ data }: { data: PreschoolCentreDashboard }) {
  const followUps = data.enquiries.followUpsDue;
  const empty =
    followUps.length === 0 &&
    data.topDues.length === 0 &&
    data.lowStock.length === 0;
  return (
    <Section title="Needs attention">
      {empty ? (
        <p className="text-muted-foreground text-sm">
          Nothing needs attention.
        </p>
      ) : (
        <div className="space-y-4">
          {followUps.length === 0 ? null : (
            <AttentionList title="Follow-ups due">
              {followUps.map((enquiry) => (
                <AttentionRow
                  key={enquiry.id}
                  href={`/preschool/enquiries/${enquiry.id}`}
                  primary={
                    <>
                      <span className="font-medium">{enquiry.childName}</span>
                      <span className="text-muted-foreground">
                        {" "}
                        · {enquiry.parentName} · {enquiry.parentPhone}
                      </span>
                    </>
                  }
                  secondary={`Due ${shortDate(enquiry.nextFollowUpOn)}`}
                />
              ))}
            </AttentionList>
          )}
          {data.topDues.length === 0 ? null : (
            <AttentionList title="Overdue fees">
              {data.topDues.map((due) => (
                <AttentionRow
                  key={due.childId}
                  href={`/preschool/fees/children/${due.childId}`}
                  primary={
                    <>
                      <span className="font-medium">{due.name}</span>
                      {due.classroomName == null ? null : (
                        <span className="text-muted-foreground">
                          {" "}
                          · {due.classroomName}
                        </span>
                      )}
                    </>
                  }
                  secondary={
                    <span className="font-medium text-red-700 tabular-nums dark:text-red-400">
                      {formatPaiseAsRupees(due.overduePaise)}
                    </span>
                  }
                />
              ))}
            </AttentionList>
          )}
          {data.lowStock.length === 0 ? null : (
            <AttentionList title="Low stock">
              {data.lowStock.map((item) => (
                <AttentionRow
                  key={item.itemId}
                  href="/preschool/stock"
                  primary={<span className="font-medium">{item.name}</span>}
                  secondary={`${item.onHand} ${item.unit} left · reorder at ${item.reorderLevel}`}
                />
              ))}
            </AttentionList>
          )}
        </div>
      )}
    </Section>
  );
}

/**
 * The Centre Dashboard: today's figures, what needs attention, seats and
 * what is coming up. A brand-new Centre sees its first steps instead.
 */
export function CentreDashboard({
  data,
  centreName,
}: {
  data: PreschoolCentreDashboard;
  centreName: string;
}) {
  const setup = data.setup;
  const brandNew = !setup.hasClassrooms && !setup.hasChildren;
  const settingUp = !(
    setup.hasClassrooms &&
    setup.hasStaff &&
    setup.hasFeeStructure &&
    setup.hasChildren
  );
  const today = data.attendanceToday;
  const overdue = data.fees.overduePaise;

  if (brandNew)
    return (
      <PreschoolPage title="Centre Dashboard" meta={centreName} width="form">
        <GetStarted setup={setup} />
      </PreschoolPage>
    );

  return (
    <PreschoolPage
      title="Centre Dashboard"
      meta={`${centreName}${data.academicYear == null ? "" : ` · ${data.academicYear.name}`}`}
    >
      {settingUp ? <GetStarted setup={setup} /> : null}
      <section
        aria-label="Today's figures"
        className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5"
      >
        <MetricCard
          label="Children"
          icon={Baby}
          value={data.children.active}
          unit={`/ ${String(data.children.capacity)}`}
          caption={`${String(data.children.seatsLeft)} seats left`}
          render={<Link href="/preschool/children" />}
        />
        <MetricCard
          label="Present today"
          icon={CalendarCheck}
          value={today.present}
          caption={
            today.present === 0 && today.notMarked > 0
              ? "Not marked yet"
              : `${String(today.stillHere)} still here`
          }
          render={<Link href="/preschool/attendance" />}
        />
        <MetricCard
          label="Collected this month"
          icon={Wallet}
          value={rupees(data.fees.collectedThisMonthPaise)}
          unit="₹"
          unitPlacement="start"
          caption={`${formatPaiseAsRupees(data.fees.collectedTodayPaise)} today`}
          render={<Link href="/preschool/fees" />}
        />
        <MetricCard
          label="Overdue"
          icon={TriangleAlert}
          value={rupees(overdue)}
          unit="₹"
          unitPlacement="start"
          badge={overdue > 0 ? "Overdue" : undefined}
          badgeTone="warning"
          caption={
            overdue > 0 ? (
              <span className="text-red-700 dark:text-red-400">
                {data.fees.childrenWithDues} Children owe{" "}
                {formatPaiseAsRupees(data.fees.duePaise)}
              </span>
            ) : (
              "Nothing overdue"
            )
          }
          render={<Link href="/preschool/fees" />}
        />
        <MetricCard
          label="Open Enquiries"
          icon={Inbox}
          value={data.enquiries.open}
          caption={`${String(data.enquiries.newThisMonth)} new · ${String(data.enquiries.admittedThisMonth)} admitted this month`}
          render={<Link href="/preschool/enquiries" />}
          className="col-span-2 lg:col-span-1"
        />
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <TodaySection data={data} />
        <NeedsAttention data={data} />
        <Section title="Seats">
          {data.children.classrooms.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No Classrooms this year.
            </p>
          ) : (
            <ul className="space-y-3">
              {data.children.classrooms.map((room) => (
                <li key={room.id} className="space-y-1">
                  <p className="text-sm">
                    <span className="font-medium">{room.name}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      · {room.programmeName}
                    </span>
                  </p>
                  <SeatsMeter
                    childCount={room.childCount}
                    capacity={room.capacity}
                  />
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Coming up">
          {data.upcoming.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No events or holidays coming up.
            </p>
          ) : (
            <ul className="space-y-2">
              {data.upcoming.map((item) => (
                <li key={item.id} className="flex items-center gap-3 text-sm">
                  <span className="bg-muted w-16 shrink-0 rounded-lg px-2 py-1 text-center text-xs font-medium tabular-nums">
                    {shortDate(item.startsOn)}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{item.title}</span>
                  <Badge
                    variant={item.kind === "holiday" ? "secondary" : "outline"}
                  >
                    {item.kind === "holiday" ? "Holiday" : "Event"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </PreschoolPage>
  );
}
