"use client";

import {
  CircleCheck,
  Flame,
  MapPinCheck,
  Milestone,
  StickyNote,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Badge } from "@repo/ui/components/badge";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@repo/ui/components/chart";
import { Progress } from "@repo/ui/components/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";

import { MARKETING_FOLLOW_UPS_PATH } from "@/lib/marketing-nav";
import { STAGE_LABELS } from "@/src/marketing/domain/marketing-terms";
import { companyPath } from "@/src/queries/marketing-companies";
import type { MarketingDashboard } from "@/src/queries/marketing-dashboard";
import { visitPath } from "@/src/queries/marketing-visits";

import {
  FollowUpTypeBadge,
  shortDayWords,
} from "../follow-ups/_components/follow-up-parts";
import {
  CheckedInMark,
  shortWhen,
  VisitStatusBadge,
  visitTime,
} from "../visits/_components/visit-parts";
import {
  MARKETING_SECTION,
  MARKETING_SECTION_HEADING,
} from "./marketing-dashboard-skeletons";

const LINK =
  "focus-visible:ring-ring/50 rounded-sm underline-offset-4 outline-none hover:underline focus-visible:ring-3";

function Section({
  id,
  title,
  aside,
  className,
  children,
}: {
  id: string;
  title: string;
  aside?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const heading = `marketing-dashboard-${id}`;
  return (
    <section
      aria-labelledby={heading}
      className={
        className == null
          ? MARKETING_SECTION
          : `${MARKETING_SECTION} ${className}`
      }
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id={heading} className={MARKETING_SECTION_HEADING}>
          {title}
        </h2>
        {aside == null ? null : (
          <p className="text-muted-foreground text-sm">{aside}</p>
        )}
      </div>
      {children}
    </section>
  );
}

function Quiet({ children }: { children: ReactNode }) {
  return <p className="text-muted-foreground text-sm">{children}</p>;
}

function CompanyLink({ company }: { company: { id: string; name: string } }) {
  return (
    <Link href={companyPath(company.id)} className={`${LINK} break-words`}>
      {company.name}
    </Link>
  );
}

type Today = MarketingDashboard["today"];

/** The viewer's own Visits and Follow-ups due today, whatever the scope. */
export function TodaySection({
  today,
  timeZone,
}: {
  today: Today;
  timeZone: string;
}) {
  if (today.visits == null && today.followUps == null) return null;
  return (
    <Section id="today" title="Today">
      <div className="grid gap-6 md:grid-cols-2">
        {today.visits == null ? null : (
          <div className="min-w-0 space-y-2">
            <h3 className="text-muted-foreground text-sm">My Visits</h3>
            {today.visits.length === 0 ? (
              <Quiet>No Visits for you today.</Quiet>
            ) : (
              <ul aria-label="My Visits today" className="divide-y">
                {today.visits.map((visit) => (
                  <li key={visit.id}>
                    <Link
                      href={visitPath(visit.id)}
                      className="hover:bg-secondary/60 focus-visible:ring-ring/50 -mx-2 flex min-w-0 items-center gap-3 rounded-md px-2 py-2 outline-none focus-visible:ring-3"
                    >
                      <span className="text-muted-foreground w-16 shrink-0 text-sm tabular-nums">
                        {visitTime(visit.visitAt, timeZone)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {visit.company.name}
                        </span>
                        <span className="text-muted-foreground text-xs">
                          {visit.number}
                        </span>
                      </span>
                      {visit.checkedIn ? <CheckedInMark /> : null}
                      {visit.status === "planned" ? null : (
                        <VisitStatusBadge status={visit.status} />
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {today.followUps == null ? null : (
          <div className="min-w-0 space-y-2">
            <h3 className="text-muted-foreground text-sm">My Follow-ups due</h3>
            {today.followUps.length === 0 ? (
              <Quiet>Nothing due today.</Quiet>
            ) : (
              <ul aria-label="My Follow-ups due today" className="divide-y">
                {today.followUps.map((followUp) => (
                  <li key={followUp.id}>
                    <Link
                      href={MARKETING_FOLLOW_UPS_PATH}
                      className="hover:bg-secondary/60 focus-visible:ring-ring/50 -mx-2 flex min-w-0 items-center gap-3 rounded-md px-2 py-2 outline-none focus-visible:ring-3"
                    >
                      <FollowUpTypeBadge type={followUp.type} />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {followUp.company.name}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Section>
  );
}

const CHART_CONFIG = {
  completed: { label: "Completed", color: "var(--chart-1)" },
  missed: { label: "Missed", color: "var(--chart-5)" },
} satisfies ChartConfig;

function calendar(date: string): Date {
  const [year = 1970, month = 1, day = 1] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

const WEEKDAY = new Intl.DateTimeFormat("en-IN", {
  weekday: "short",
  timeZone: "UTC",
});

/** "Mon 10" for a day, "10 Nov" for the week starting that Monday. */
export function bucketWords(start: string, bucket: "day" | "week"): string {
  if (bucket === "week") return shortDayWords(start);
  const date = calendar(start);
  return `${WEEKDAY.format(date)} ${String(date.getUTCDate())}`;
}

type OverTime = NonNullable<MarketingDashboard["overTime"]>;

export function OverTimeSection({ overTime }: { overTime: OverTime }) {
  const { bucket, points } = overTime;
  const data = points.map((point) => ({
    ...point,
    label: bucketWords(point.start, bucket),
  }));
  const none = points.every(
    (point) => point.completed === 0 && point.missed === 0,
  );
  return (
    <Section
      id="over-time"
      title="Visits over time"
      aside={bucket === "day" ? "Per day" : "Per week, from Monday"}
    >
      {none ? (
        <Quiet>No Visits completed or missed in this period.</Quiet>
      ) : null}
      <ChartContainer
        config={CHART_CONFIG}
        aria-hidden="true"
        className="aspect-auto h-56 w-full"
      >
        <BarChart data={data} margin={{ left: -20, right: 4, top: 4 }}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={8}
          />
          <YAxis
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
            width={44}
          />
          <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
          <ChartLegend content={<ChartLegendContent />} />
          <Bar
            dataKey="completed"
            fill="var(--color-completed)"
            radius={[4, 4, 0, 0]}
          />
          <Bar
            dataKey="missed"
            fill="var(--color-missed)"
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ChartContainer>
      <table className="sr-only">
        <caption>Visits over time</caption>
        <thead>
          <tr>
            <th scope="col">{bucket === "day" ? "Day" : "Week of"}</th>
            <th scope="col">Completed</th>
            <th scope="col">Missed</th>
          </tr>
        </thead>
        <tbody>
          {data.map((point) => (
            <tr key={point.start}>
              <th scope="row">{point.label}</th>
              <td>{point.completed}</td>
              <td>{point.missed}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

type Stages = NonNullable<MarketingDashboard["stages"]>;

export function StagesSection({ stages }: { stages: Stages }) {
  const most = Math.max(1, ...stages.counts.map((row) => row.count));
  return (
    <Section
      id="stages"
      title="Companies by Stage"
      aside={`Won ${String(stages.wonInPeriod)} · Lost ${String(stages.lostInPeriod)} in this period`}
    >
      <ul aria-label="Companies by Stage" className="space-y-2.5">
        {stages.counts.map((row) => (
          <li
            key={row.stage}
            className="grid grid-cols-[minmax(0,9.5rem)_minmax(0,1fr)_2.5rem] items-center gap-3 text-sm"
          >
            <span className="truncate">{STAGE_LABELS[row.stage]}</span>
            <span className="bg-muted h-2 overflow-hidden rounded-full">
              <span
                className="bg-chart-1 block h-full rounded-full"
                style={{ width: `${String((row.count / most) * 100)}%` }}
              />
            </span>
            <span className="text-right tabular-nums">{row.count}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

type Person = NonNullable<MarketingDashboard["perPerson"]>[number];

function PersonName({ person }: { person: Person }) {
  return (
    <span className="break-words">
      {person.name}
      {person.active ? null : (
        <span className="text-muted-foreground"> (inactive)</span>
      )}
    </span>
  );
}

/** The month's target with a bar toward it; "—" without one. */
function TargetBar({ person }: { person: Person }) {
  const { completed, target } = person;
  if (target == null) return <span className="text-muted-foreground">—</span>;
  const percent =
    target === 0 ? 100 : Math.min(100, Math.round((completed / target) * 100));
  return (
    <div className="min-w-20 space-y-1">
      <span className="text-muted-foreground tabular-nums">{target}</span>
      <Progress
        value={percent}
        aria-label={`${person.name}: ${String(completed)} of ${String(target)} Visits`}
      />
    </div>
  );
}

export function PerPersonSection({ people }: { people: Person[] }) {
  return (
    <Section id="per-person" title="Visits per Marketing Person">
      {people.length === 0 ? (
        <Quiet>No Marketing People yet.</Quiet>
      ) : (
        <Table aria-label="Visits per Marketing Person">
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="text-right">Completed</TableHead>
              <TableHead className="w-[40%]">Target</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {people.map((person) => (
              <TableRow key={person.memberId}>
                <TableCell className="max-w-48 whitespace-normal">
                  <PersonName person={person} />
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {person.completed}
                </TableCell>
                <TableCell>
                  <TargetBar person={person} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Section>
  );
}

type Recent = NonNullable<MarketingDashboard["recent"]>[number];

const KINDS: Record<Recent["kind"], { icon: LucideIcon; label: string }> = {
  visit_completed: { icon: MapPinCheck, label: "Visit completed" },
  note: { icon: StickyNote, label: "Note" },
  stage_change: { icon: Milestone, label: "Stage changed" },
  follow_up_done: { icon: CircleCheck, label: "Follow-up done" },
};

export function RecentSection({
  recent,
  timeZone,
}: {
  recent: Recent[];
  timeZone: string;
}) {
  return (
    <Section id="recent" title="Recent activity">
      {recent.length === 0 ? (
        <Quiet>
          Nothing yet. Completed Visits, notes and Stage changes show here.
        </Quiet>
      ) : (
        <ul aria-label="Recent activity" className="space-y-3">
          {recent.map((row, index) => {
            const kind = KINDS[row.kind];
            return (
              <li
                key={`${row.kind}-${row.at}-${String(index)}`}
                className="flex min-w-0 gap-3"
              >
                <span className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-md">
                  <kind.icon aria-hidden="true" className="size-4" />
                  <span className="sr-only">{kind.label}</span>
                </span>
                <span className="min-w-0 flex-1 space-y-0.5 text-sm">
                  <span className="block break-words">
                    {row.visit == null ? (
                      row.text
                    ) : (
                      <Link href={visitPath(row.visit.id)} className={LINK}>
                        {row.text}
                      </Link>
                    )}
                  </span>
                  <span className="text-muted-foreground flex flex-wrap gap-x-1.5 text-xs">
                    <CompanyLink company={row.company} />
                    {row.by == null ? null : (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{row.by.name}</span>
                      </>
                    )}
                    <span aria-hidden="true">·</span>
                    <time dateTime={row.at}>{shortWhen(row.at, timeZone)}</time>
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

type Hot = NonNullable<MarketingDashboard["hotWithoutFollowUp"]>[number];

export function HotSection({
  companies,
  timeZone,
}: {
  companies: Hot[];
  timeZone: string;
}) {
  return (
    <Section id="hot" title="Hot companies with no Follow-up">
      {companies.length === 0 ? (
        <Quiet>Every Hot company has a Follow-up.</Quiet>
      ) : (
        <ul aria-label="Hot companies with no Follow-up" className="divide-y">
          {companies.map((company) => (
            <li
              key={company.id}
              className="flex min-w-0 items-center gap-3 py-2"
            >
              <Flame
                aria-hidden="true"
                className="size-4 shrink-0 text-orange-600 dark:text-orange-400"
              />
              <span className="min-w-0 flex-1 text-sm">
                <span className="block font-medium">
                  <CompanyLink company={company} />
                </span>
                <span className="text-muted-foreground text-xs">
                  {`Last Visit ${shortDayWords(dayIn(company.lastVisitAt, timeZone))}`}
                </span>
              </span>
              {company.assignedTo == null ? null : (
                <Badge variant="outline" className="max-w-40 truncate">
                  {company.assignedTo.name}
                </Badge>
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/** An instant's `YYYY-MM-DD` in the zone. */
function dayIn(at: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(at));
}
