"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import {
  CalendarHeart,
  CalendarOff,
  ChevronRight,
  Clock,
  ListChecks,
  LogIn,
  LogOut,
  UserCheck,
  UserX,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Badge } from "@repo/ui/components/badge";
import { buttonVariants } from "@repo/ui/components/button";
import { cn } from "@repo/ui/lib/utils";

import { HRMS_PATH } from "@/lib/hrms-nav";
import {
  hrmsDashboardQuery,
  type HrmsDashboardModel,
} from "@/src/queries/hrms-dashboard";

import {
  AttendanceRead,
  DAY_STATUS_LABELS,
  formatClock,
  formatWeekdayDate,
  hoursText,
} from "./attendance-parts";
import { HrmsEmpty, HrmsPage } from "./hrms-parts";
import { formatDay, formatDays, STATUS_LABELS } from "./leave/leave-format";

type Team = NonNullable<HrmsDashboardModel["team"]>;
type Counts = Team["breakdown"];
type ApprovalItem = NonNullable<
  HrmsDashboardModel["approvals"]
>["items"][number];

const MY_ATTENDANCE = `${HRMS_PATH}/attendance/my`;
const TEAM_ATTENDANCE = `${HRMS_PATH}/attendance/team`;
const ATTENDANCE_APPROVALS = `${HRMS_PATH}/attendance/approvals`;
const MY_LEAVES = `${HRMS_PATH}/leave/my`;
const LEAVE_APPROVALS = `${HRMS_PATH}/leave/approvals`;
const TEAM_LEAVES = `${HRMS_PATH}/leave/team`;
const HOLIDAYS = `${HRMS_PATH}/configuration/holidays`;
const CONFIGURATION = `${HRMS_PATH}/configuration`;
const TEAM_MEMBERS = "/app/masters/team-members";

/**
 * The breakdown's rows and the trend's series, in stacking order (bottom
 * up). Tones are the ones Team Today's badges use.
 */
const SERIES: readonly {
  key: "present" | "halfDay" | "onLeave" | "absent" | "off";
  label: string;
  todayLabel: string;
  swatch: string;
}[] = [
  {
    key: "present",
    label: "Present",
    todayLabel: "Present",
    swatch: "bg-chart-3",
  },
  {
    key: "halfDay",
    label: "Half day",
    todayLabel: "Half day",
    swatch: "bg-chart-3/45",
  },
  {
    key: "onLeave",
    label: "On leave",
    todayLabel: "On leave",
    swatch: "bg-chart-4",
  },
  {
    key: "absent",
    label: "Absent",
    todayLabel: "Absent or not checked in",
    swatch: "bg-destructive/70",
  },
  {
    key: "off",
    label: "Holiday or week off",
    todayLabel: "Holiday or week off",
    swatch: "bg-secondary",
  },
];

function seriesValue(counts: Counts, key: (typeof SERIES)[number]["key"]) {
  return key === "off" ? counts.holiday + counts.weekOff : counts[key];
}

function total(counts: Counts): number {
  return SERIES.reduce((sum, item) => sum + seriesValue(counts, item.key), 0);
}

function Section({
  id,
  title,
  action,
  children,
  className,
}: {
  id: string;
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-labelledby={id}
      className={cn(
        "bg-card space-y-4 rounded-2xl border p-4 sm:p-5",
        className,
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id={id} className="font-semibold">
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function SeeAll({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="text-primary inline-flex items-center gap-0.5 text-sm font-medium hover:underline"
    >
      {label}
      <ChevronRight aria-hidden="true" className="size-4" />
    </Link>
  );
}

function Tile({
  label,
  value,
  caption,
  icon: Icon,
  tone,
  href,
  className,
}: {
  label: string;
  value: number;
  caption: string;
  icon: LucideIcon;
  tone: string;
  href?: string;
  className?: string;
}) {
  const body = (
    <>
      <p className="text-muted-foreground text-sm">{label}</p>
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-xl",
            tone,
          )}
        >
          <Icon className="size-5" />
        </span>
        <span className="text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">
          {value}
        </span>
      </div>
      <p className="text-muted-foreground text-xs">{caption}</p>
    </>
  );
  const style = cn(
    "bg-card flex flex-col gap-3 rounded-2xl border p-4 shadow-xs",
    href == null
      ? ""
      : "hover:bg-secondary/60 focus-visible:ring-ring/50 transition-colors outline-none focus-visible:ring-3",
    className,
  );
  return href == null ? (
    <div className={style}>{body}</div>
  ) : (
    <Link href={href} className={style}>
      {body}
    </Link>
  );
}

function approvalsHref(data: HrmsDashboardModel): string {
  const approvals = data.approvals;
  if (approvals == null) return ATTENDANCE_APPROVALS;
  if ((approvals.attendance ?? 0) > 0) return ATTENDANCE_APPROVALS;
  if ((approvals.leave ?? 0) + (approvals.cancellations ?? 0) > 0)
    return LEAVE_APPROVALS;
  return approvals.attendance == null ? LEAVE_APPROVALS : ATTENDANCE_APPROVALS;
}

function QuickActions({ data }: { data: HrmsDashboardModel }) {
  const { permissions } = data;
  const checkedIn = data.me?.today?.state === "checked_in";
  const actions: ReactNode[] = [];
  if (permissions.checkIn)
    actions.push(
      <Link key="check" href={MY_ATTENDANCE} className={buttonVariants()}>
        {checkedIn ? (
          <LogOut aria-hidden="true" />
        ) : (
          <LogIn aria-hidden="true" />
        )}
        {checkedIn ? "Check out" : "Check in"}
      </Link>,
    );
  if (permissions.applyLeave)
    actions.push(
      <Link
        key="leave"
        href={MY_LEAVES}
        className={buttonVariants({ variant: "outline" })}
      >
        <CalendarOff aria-hidden="true" />
        Apply leave
      </Link>,
    );
  if (data.approvals != null)
    actions.push(
      <Link
        key="approvals"
        href={approvalsHref(data)}
        className={buttonVariants({ variant: "outline" })}
      >
        <ListChecks aria-hidden="true" />
        Approvals
        {data.approvals.total > 0 ? (
          <Badge className="tabular-nums">{data.approvals.total}</Badge>
        ) : null}
      </Link>,
    );
  if (actions.length === 0) return null;
  return (
    <nav aria-label="Quick actions" className="flex flex-wrap gap-2">
      {actions}
    </nav>
  );
}

function Snapshot({ data, team }: { data: HrmsDashboardModel; team: Team }) {
  const approvals = data.approvals;
  return (
    <section aria-labelledby="hrms-snapshot" className="space-y-3">
      <h3 id="hrms-snapshot" className="font-semibold">
        Today&apos;s snapshot
      </h3>
      <div
        className={cn(
          "grid grid-cols-2 gap-3",
          approvals == null ? "lg:grid-cols-4" : "lg:grid-cols-5",
        )}
      >
        <Tile
          label="Present today"
          value={team.presentToday}
          caption={
            team.late > 0
              ? `${String(team.late)} late`
              : `of ${String(team.employees)} Team Members`
          }
          icon={UserCheck}
          tone="bg-chart-3/12 text-chart-3"
          href={TEAM_ATTENDANCE}
        />
        <Tile
          label="On leave"
          value={team.onLeave}
          caption="Approved leave today"
          icon={CalendarOff}
          tone="bg-chart-4/12 text-chart-4"
          href={data.teamLeaves == null ? undefined : TEAM_LEAVES}
        />
        <Tile
          label="Not checked in"
          value={team.notCheckedIn}
          caption="Working today, no check-in yet"
          icon={UserX}
          tone="bg-destructive/10 text-destructive"
          href={TEAM_ATTENDANCE}
        />
        <Tile
          label="Team Members"
          value={team.employees}
          caption="Joined the Company"
          icon={Users}
          tone="bg-primary/12 text-primary"
        />
        {approvals == null ? null : (
          <Tile
            label="Pending approvals"
            value={approvals.total}
            caption="Waiting for your decision"
            icon={ListChecks}
            tone="bg-chart-2/12 text-chart-2"
            href={approvalsHref(data)}
            className="col-span-2 lg:col-span-1"
          />
        )}
      </div>
    </section>
  );
}

function Breakdown({ team }: { team: Team }) {
  const counts = team.breakdown;
  const all = Math.max(1, total(counts));
  return (
    <Section id="hrms-breakdown" title="Present / absent today">
      <div
        aria-hidden="true"
        className="bg-secondary flex h-3 overflow-hidden rounded-full"
      >
        {SERIES.map((item) => {
          const value = seriesValue(counts, item.key);
          return value === 0 ? null : (
            <div
              key={item.key}
              className={item.swatch}
              style={{ width: `${String((value / all) * 100)}%` }}
            />
          );
        })}
      </div>
      <dl aria-label="Today's breakdown" className="divide-y">
        {SERIES.map((item) => (
          <div
            key={item.key}
            className="flex items-center justify-between gap-3 py-2 text-sm"
          >
            <dt className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={cn("size-2.5 rounded-full border", item.swatch)}
              />
              {item.todayLabel}
            </dt>
            <dd className="font-medium tabular-nums">
              {seriesValue(counts, item.key)}
            </dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}

/**
 * The last 14 days, one bar per day stacked by status (the Project
 * Overview's labour chart, with every Team Member in each bar); hover or
 * focus a day for its numbers.
 */
function Trend({ team }: { team: Team }) {
  const series = team.trend;
  const [active, setActive] = useState(series.length - 1);
  const shown = series[active] ?? series.at(-1);
  return (
    <Section
      id="hrms-trend"
      title="Day-wise trend, last 14 days"
      className="lg:col-span-2"
      action={
        shown == null ? null : (
          <p className="text-muted-foreground text-xs" aria-live="polite">
            {formatDay(shown.date)}: {shown.present + shown.halfDay} present,{" "}
            {shown.absent} absent, {shown.onLeave} on leave
          </p>
        )
      }
    >
      <div
        className="flex h-36 items-end gap-1 border-b"
        aria-hidden="true"
        onMouseLeave={() => {
          setActive(series.length - 1);
        }}
      >
        {series.map((day, index) => {
          const all = Math.max(1, total(day));
          return (
            <div
              key={day.date}
              className={cn(
                "flex h-full flex-1 flex-col-reverse overflow-hidden rounded-t-[4px] transition-opacity",
                index === active ? "opacity-100" : "opacity-80",
              )}
              onMouseEnter={() => {
                setActive(index);
              }}
            >
              {SERIES.map((item) => {
                const value = seriesValue(day, item.key);
                return value === 0 ? null : (
                  <div
                    key={item.key}
                    className={item.swatch}
                    style={{ height: `${String((value / all) * 100)}%` }}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
      <div
        className="text-muted-foreground -mt-3 flex justify-between text-[0.7rem]"
        aria-hidden="true"
      >
        <span>{series[0] == null ? "" : formatDay(series[0].date)}</span>
        <span>Today, so far</span>
      </div>
      <ul
        aria-label="Legend"
        className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs"
      >
        {SERIES.map((item) => (
          <li key={item.key} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className={cn("size-2.5 rounded-sm border", item.swatch)}
            />
            {item.label}
          </li>
        ))}
      </ul>
      <table className="sr-only">
        <caption>Team Members per day by status</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            {SERIES.map((item) => (
              <th key={item.key} scope="col">
                {item.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {series.map((day) => (
            <tr key={day.date}>
              <th scope="row">{formatDay(day.date)}</th>
              {SERIES.map((item) => (
                <td key={item.key}>{seriesValue(day, item.key)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

function range(from: string, to: string): string {
  return from === to
    ? formatDay(from)
    : `${formatDay(from)} – ${formatDay(to)}`;
}

function itemHref(item: ApprovalItem): string {
  return item.kind === "attendance" ? ATTENDANCE_APPROVALS : LEAVE_APPROVALS;
}

function RequestList({
  label,
  items,
  linked,
}: {
  label: string;
  items: ApprovalItem[];
  /** Approvers open the approval page; a member's own requests open their page. */
  linked: "approvals" | "mine";
}) {
  return (
    <ul aria-label={label} className="-mx-2 space-y-1">
      {items.map((item) => (
        <li key={`${item.kind}-${item.id}`}>
          <Link
            href={
              linked === "approvals"
                ? itemHref(item)
                : item.kind === "attendance"
                  ? MY_ATTENDANCE
                  : MY_LEAVES
            }
            className="hover:bg-secondary/60 focus-visible:ring-ring/50 flex items-center gap-3 rounded-xl px-2 py-2 transition-colors outline-none focus-visible:ring-3"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {linked === "approvals"
                  ? `${item.memberName} · ${item.title}`
                  : item.title}
              </p>
              <p className="text-muted-foreground truncate text-xs">
                {range(item.fromDate, item.toDate)}
                {item.days == null ? "" : ` · ${formatDays(item.days)}`}
              </p>
            </div>
            <ChevronRight
              aria-hidden="true"
              className="text-muted-foreground size-4 shrink-0"
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Approvals({
  approvals,
}: {
  approvals: NonNullable<HrmsDashboardModel["approvals"]>;
}) {
  const parts = [
    approvals.attendance == null
      ? null
      : `${String(approvals.attendance)} attendance`,
    approvals.leave == null ? null : `${String(approvals.leave)} leave`,
    approvals.cancellations == null
      ? null
      : `${String(approvals.cancellations)} cancellation`,
  ].filter((part) => part != null);
  return (
    <Section
      id="hrms-approvals"
      title="Pending approvals"
      action={
        <span className="text-muted-foreground text-xs">
          {parts.join(" · ")}
        </span>
      }
    >
      {approvals.items.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Nothing is waiting for your decision.
        </p>
      ) : (
        <RequestList
          label="Waiting for your decision"
          items={approvals.items}
          linked="approvals"
        />
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {approvals.attendance == null ? null : (
          <SeeAll href={ATTENDANCE_APPROVALS} label="Attendance approvals" />
        )}
        {approvals.leave == null ? null : (
          <SeeAll href={LEAVE_APPROVALS} label="Leave approvals" />
        )}
      </div>
    </Section>
  );
}

function TeamLeaves({
  leaves,
}: {
  leaves: NonNullable<HrmsDashboardModel["teamLeaves"]>;
}) {
  return (
    <Section
      id="hrms-team-leaves"
      title="Team leaves, next 14 days"
      action={<SeeAll href={TEAM_LEAVES} label="Team Leaves" />}
    >
      {leaves.items.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Nobody is on leave in the next 14 days.
        </p>
      ) : (
        <ul aria-label="Upcoming leave" className="divide-y">
          {leaves.items.map((leave) => (
            <li
              key={leave.id}
              className="flex flex-wrap items-center justify-between gap-2 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {leave.memberName}
                </p>
                <p className="text-muted-foreground text-xs">
                  {leave.leaveTypeName} · {range(leave.fromDate, leave.toDate)}{" "}
                  · {formatDays(leave.totalDays)}
                </p>
              </div>
              {leave.status === "approved" ? null : (
                <Badge variant="secondary">{STATUS_LABELS[leave.status]}</Badge>
              )}
            </li>
          ))}
        </ul>
      )}
      {leaves.total > leaves.items.length ? (
        <p className="text-muted-foreground text-xs">
          {leaves.total - leaves.items.length} more on Team Leaves.
        </p>
      ) : null}
    </Section>
  );
}

function Holidays({
  holidays,
}: {
  holidays: NonNullable<HrmsDashboardModel["holidays"]>;
}) {
  return (
    <Section id="hrms-holidays" title="Upcoming holidays">
      {holidays.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No holidays coming up.{" "}
          <Link
            href={HOLIDAYS}
            className="text-primary underline underline-offset-4"
          >
            Add the year&apos;s holidays
          </Link>
          .
        </p>
      ) : (
        <ul aria-label="Upcoming holidays" className="divide-y">
          {holidays.map((holiday) => (
            <li
              key={holiday.id}
              className="flex items-center justify-between gap-3 py-2"
            >
              <span className="flex min-w-0 items-center gap-2">
                <CalendarHeart
                  aria-hidden="true"
                  className="text-primary size-4 shrink-0"
                />
                <span className="truncate text-sm font-medium">
                  {holiday.name}
                </span>
                {holiday.isOptional ? (
                  <Badge variant="outline">Optional</Badge>
                ) : null}
              </span>
              <span className="text-muted-foreground shrink-0 text-xs">
                {formatDay(holiday.date)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

type MyToday = NonNullable<NonNullable<HrmsDashboardModel["me"]>["today"]>;

/** "Checked in at 9:20 am", "Half Day so far", "Diwali"… */
function myDayTitle(today: MyToday, timeZone: string): string {
  switch (today.state) {
    case "checked_in":
      return today.firstCheckInAt == null
        ? "Checked in"
        : `Checked in at ${formatClock(today.firstCheckInAt, timeZone)}`;
    case "checked_out":
      return `${DAY_STATUS_LABELS[today.status]} so far`;
    case "not_checked_in":
      return "Not checked in yet";
    case "on_leave":
      return "On leave today";
    case "holiday":
      return today.holidayName ?? "Holiday";
    case "week_off":
      return "Week off";
  }
}

/** "Shift: General · Out 6:05 pm · 8.5 h". */
function myDayDetail(today: MyToday, timeZone: string): string {
  const parts = [`Shift: ${today.shiftName}`];
  if (today.state === "checked_out" && today.firstCheckInAt != null)
    parts.push(`In ${formatClock(today.firstCheckInAt, timeZone)}`);
  if (today.lastCheckOutAt != null)
    parts.push(`Out ${formatClock(today.lastCheckOutAt, timeZone)}`);
  if (today.workedHours > 0) parts.push(hoursText(today.workedHours));
  return parts.join(" · ");
}

function MyDay({
  me,
  timeZone,
}: {
  me: NonNullable<HrmsDashboardModel["me"]>;
  timeZone: string;
}) {
  const { today, balances, pending } = me;
  return (
    <Section
      id="hrms-my-day"
      title="Your day"
      action={<SeeAll href={MY_ATTENDANCE} label="My Attendance" />}
    >
      {today == null ? (
        <p className="text-muted-foreground text-sm">
          Your attendance is not shared with you.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <span
            aria-hidden="true"
            className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-xl"
          >
            <Clock className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{myDayTitle(today, timeZone)}</p>
            <p className="text-muted-foreground text-xs">
              {myDayDetail(today, timeZone)}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {today.late ? <Badge variant="outline">Late</Badge> : null}
            {today.openFromEarlierDay ? (
              <Badge variant="outline">Open from earlier</Badge>
            ) : null}
          </div>
        </div>
      )}
      {balances == null ? null : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h4 className="text-sm font-medium">
              Leave balance{me.leaveYear == null ? "" : ` · ${me.leaveYear}`}
            </h4>
            <SeeAll href={MY_LEAVES} label="My Leaves" />
          </div>
          {balances.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No leave balances yet.
            </p>
          ) : (
            <ul
              aria-label="Leave balance"
              className="grid grid-cols-2 gap-2 sm:grid-cols-3"
            >
              {balances.map((row) => (
                <li
                  key={row.leaveTypeId}
                  className="bg-secondary/50 rounded-xl px-3 py-2"
                >
                  <p className="text-muted-foreground truncate text-xs">
                    {row.leaveTypeName}
                  </p>
                  <p className="text-sm font-semibold tabular-nums">
                    {formatDays(row.available)}
                    {row.entitlement > 0 ? (
                      <span className="text-muted-foreground font-normal">
                        {" "}
                        of {String(row.entitlement)}
                      </span>
                    ) : null}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {pending.attendance == null && pending.leave == null ? null : (
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Your pending requests</h4>
          {pending.items.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nothing of yours is waiting for a decision.
            </p>
          ) : (
            <RequestList
              label="Your pending requests"
              items={pending.items}
              linked="mine"
            />
          )}
        </div>
      )}
    </Section>
  );
}

function NoTeamYet() {
  return (
    <HrmsEmpty
      icon={Users}
      title="No Team Members yet"
      description="Invite your staff from Team Members. Then set working hours, holidays, shifts and leave in Configuration, and their attendance shows here."
      action={
        <div className="flex flex-wrap justify-center gap-2">
          <Link href={TEAM_MEMBERS} className={buttonVariants()}>
            Add Team Members
          </Link>
          <Link
            href={CONFIGURATION}
            className={buttonVariants({ variant: "outline" })}
          >
            Configuration
          </Link>
        </div>
      }
    />
  );
}

function Dashboard() {
  const { data } = useSuspenseQuery(hrmsDashboardQuery);
  const { team, me } = data;
  // The Owner is a Team Member too: a team of one is no team yet.
  const noTeam = team != null && team.employees <= (me == null ? 0 : 1);
  const myDay = me == null ? null : <MyDay me={me} timeZone={data.timeZone} />;
  const lists = [
    data.approvals == null ? null : (
      <Approvals key="approvals" approvals={data.approvals} />
    ),
    data.teamLeaves == null ? null : (
      <TeamLeaves key="leaves" leaves={data.teamLeaves} />
    ),
  ].filter((item) => item != null);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          {formatWeekdayDate(data.today)}
        </p>
        <QuickActions data={data} />
      </div>
      {team == null ? myDay : null}
      {team == null ? null : noTeam ? (
        <NoTeamYet />
      ) : (
        <>
          <Snapshot data={data} team={team} />
          <div className="grid gap-4 lg:grid-cols-3">
            <Breakdown team={team} />
            <Trend team={team} />
          </div>
        </>
      )}
      {lists.length === 0 ? null : (
        <div className="grid gap-4 md:grid-cols-2">{lists}</div>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {team == null ? null : myDay}
        {data.holidays == null ? null : <Holidays holidays={data.holidays} />}
      </div>
      {team == null && me == null && lists.length === 0 ? (
        <HrmsEmpty
          icon={Users}
          title="Nothing to show yet"
          description="Your Permission Matrix does not include attendance or leave. Ask the Owner if you need them."
        />
      ) : null}
    </div>
  );
}

/**
 * The HRMS Dashboard (CM-319, `modules/11` "HRMS dashboard"): quick
 * actions, today's snapshot, the present/absent breakdown and the 14-day
 * trend for those with View All on attendance; what waits for the
 * caller's decision; team leave and holidays ahead; and the caller's own
 * day, balances and requests. Each part shows only with its permission.
 */
export function HrmsDashboardPage() {
  return (
    <HrmsPage
      title="HRMS Dashboard"
      description="Who is in today, who is on leave, and what waits for you."
      wide
    >
      <AttendanceRead what="the HRMS Dashboard">
        <Dashboard />
      </AttendanceRead>
    </HrmsPage>
  );
}
