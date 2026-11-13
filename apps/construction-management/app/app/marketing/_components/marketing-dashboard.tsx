"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import {
  Building,
  CalendarCheck,
  CalendarClock,
  CalendarX,
  ClipboardList,
  Trophy,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useQueryStates } from "nuqs";
import {
  Suspense,
  useDeferredValue,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { MetricCard } from "@repo/ui/components/metric-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";

import { PageHeader } from "@/app/app/_components/app-shell/page-header";
import { MARKETING_FOLLOW_UPS_PATH } from "@/lib/marketing-nav";
import type { DashboardPeriodKind } from "@/src/marketing/domain/dashboard";
import {
  customPeriodProblem,
  dashboardFilters,
  MARKETING_DASHBOARD_SEARCH,
  marketingDashboardQuery,
  type MarketingDashboard as Dashboard,
  type MarketingDashboardFilters,
} from "@/src/queries/marketing-dashboard";

import {
  dayWords,
  shortDayWords,
} from "../follow-ups/_components/follow-up-parts";
import {
  HotSection,
  OverTimeSection,
  PerPersonSection,
  RecentSection,
  StagesSection,
  TodaySection,
} from "./marketing-dashboard-sections";
import {
  MARKETING_TOTALS_GRID,
  MarketingDashboardSkeleton,
} from "./marketing-dashboard-skeletons";

const PERIODS: { value: DashboardPeriodKind; label: string }[] = [
  { value: "this_week", label: "This week" },
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "custom", label: "Custom" },
];

const EVERYONE = "all";

type SetSearch = ReturnType<
  typeof useQueryStates<typeof MARKETING_DASHBOARD_SEARCH>
>[1];

/** "Your figures", "The team's figures" or "Ravi Kumar's figures". */
function whoseWords(data: Dashboard, memberId: string | undefined): string {
  if (data.scope === "own") return "Your figures";
  if (data.scope === "team") return "The team's figures";
  const person = data.people?.find((item) => item.id === memberId);
  return person == null ? "One person's figures" : `${person.name}'s figures`;
}

/** "1 Nov – 30 Nov 2026", or one day. */
function periodWords({ from, to }: Dashboard["period"]): string {
  return from === to
    ? dayWords(from)
    : `${shortDayWords(from)} – ${dayWords(to)}`;
}

function CustomDates({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (range: { from: string; to: string }) => void;
}) {
  const [draft, setDraft] = useState({ from, to });
  const problem = customPeriodProblem(draft.from, draft.to);
  const change = (next: { from: string; to: string }) => {
    setDraft(next);
    if (customPeriodProblem(next.from, next.to) == null) onChange(next);
  };
  return (
    <div className="col-span-full space-y-1 sm:col-span-1">
      <div className="grid grid-cols-2 gap-2 sm:flex sm:items-end">
        <div className="min-w-0 space-y-1">
          <Label htmlFor="marketing-dashboard-from" className="text-xs">
            From
          </Label>
          <Input
            id="marketing-dashboard-from"
            type="date"
            className="h-10 w-full sm:w-40"
            value={draft.from}
            onChange={(event) => {
              change({ ...draft, from: event.target.value });
            }}
          />
        </div>
        <div className="min-w-0 space-y-1">
          <Label htmlFor="marketing-dashboard-to" className="text-xs">
            To
          </Label>
          <Input
            id="marketing-dashboard-to"
            type="date"
            className="h-10 w-full sm:w-40"
            value={draft.to}
            onChange={(event) => {
              change({ ...draft, to: event.target.value });
            }}
          />
        </div>
      </div>
      {problem == null ? null : (
        <p role="alert" className="text-destructive text-sm">
          {problem}
        </p>
      )}
    </div>
  );
}

function Controls({
  data,
  filters,
  setSearch,
}: {
  data: Dashboard;
  filters: MarketingDashboardFilters;
  setSearch: SetSearch;
}) {
  const people = data.canViewTeam ? (data.people ?? []) : null;
  const personItems =
    people == null
      ? []
      : [
          { value: EVERYONE, label: "All people" },
          ...people.map((person) => ({
            value: person.id,
            label: person.active ? person.name : `${person.name} (inactive)`,
          })),
        ];
  return (
    <div className="grid w-full min-w-0 grid-cols-2 gap-3 sm:flex sm:w-auto sm:flex-wrap sm:items-end">
      <Select
        items={PERIODS}
        value={filters.period}
        onValueChange={(next) => {
          if (next == null || next === filters.period) return;
          void setSearch(
            next === "custom"
              ? { period: next, from: data.period.from, to: data.period.to }
              : { period: next, from: null, to: null },
          );
        }}
      >
        <SelectTrigger
          aria-label="Period"
          size="lg"
          className="w-full min-w-0 sm:w-40"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent aria-label="Period">
          {PERIODS.map((period) => (
            <SelectItem key={period.value} value={period.value}>
              {period.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {people == null ? null : (
        <Select
          items={personItems}
          value={filters.memberId ?? EVERYONE}
          onValueChange={(next) => {
            if (next == null) return;
            void setSearch({ memberId: next === EVERYONE ? null : next });
          }}
        >
          <SelectTrigger
            aria-label="Marketing Person"
            size="lg"
            className="w-full min-w-0 sm:w-56"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent aria-label="Marketing Person">
            {personItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {filters.period === "custom" ? (
        <CustomDates
          key={`${filters.from ?? ""}/${filters.to ?? ""}`}
          from={filters.from ?? data.period.from}
          to={filters.to ?? data.period.to}
          onChange={(range) => {
            void setSearch(range);
          }}
        />
      ) : null}
    </div>
  );
}

type Total = {
  key: string;
  label: string;
  icon: LucideIcon;
  value: number;
  caption: string;
  /** Red when above zero. */
  alarming?: boolean;
  href?: string;
};

function totalsOf(data: Dashboard, followUpsHref: string | null): Total[] {
  const { totals } = data;
  const all: (Omit<Total, "value"> & { value: number | null })[] = [
    {
      key: "completed",
      label: "Visits completed",
      icon: CalendarCheck,
      value: totals.visitsCompleted,
      caption: "In the period",
    },
    {
      key: "planned",
      label: "Visits planned",
      icon: CalendarClock,
      value: totals.visitsPlanned,
      caption: "Still to come in the period",
    },
    {
      key: "missed",
      label: "Visits missed",
      icon: CalendarX,
      value: totals.visitsMissed,
      caption: "Planned, and the time passed",
      alarming: true,
    },
    {
      key: "due-today",
      label: "Follow-ups due today",
      icon: ClipboardList,
      value: totals.followUpsDueToday,
      caption: "Open, whatever the period",
      href: followUpsHref ?? undefined,
    },
    {
      key: "overdue",
      label: "Follow-ups overdue",
      icon: TriangleAlert,
      value: totals.followUpsOverdue,
      caption: "Open, past their due date",
      alarming: true,
      href: followUpsHref ?? undefined,
    },
    {
      key: "new-companies",
      label: "New Prospect Companies",
      icon: Building,
      value: totals.newCompanies,
      caption: "Added in the period",
    },
    {
      key: "won",
      label: "Won",
      icon: Trophy,
      value: totals.companiesWon,
      caption: "Prospect Companies moved to Won",
    },
  ];
  return all.filter((total): total is Total => total.value != null);
}

/**
 * Follow-ups due and overdue on the Follow-ups list, which opens on the
 * viewer's own or, with `?owner=`, one person's; the team has no address.
 */
function followUpsHref(data: Dashboard, memberId: string | undefined) {
  if (data.scope === "own") return MARKETING_FOLLOW_UPS_PATH;
  if (data.scope === "person" && memberId != null)
    return `${MARKETING_FOLLOW_UPS_PATH}?owner=${encodeURIComponent(memberId)}`;
  return null;
}

function Totals({ totals }: { totals: Total[] }) {
  if (totals.length === 0) return null;
  return (
    <ul aria-label="Totals" className={MARKETING_TOTALS_GRID}>
      {totals.map((total) => {
        const red = total.alarming === true && total.value > 0;
        return (
          <li key={total.key} className="flex min-w-0">
            <MetricCard
              className="w-full"
              label={total.label}
              icon={total.icon}
              value={
                red ? (
                  <span className="text-destructive">{total.value}</span>
                ) : (
                  total.value
                )
              }
              caption={total.caption}
              render={
                total.href == null ? undefined : (
                  <Link href={total.href} aria-label={total.label} />
                )
              }
            />
          </li>
        );
      })}
    </ul>
  );
}

function Body({
  data,
  timeZone,
}: {
  data: Dashboard;
  timeZone: string;
}): ReactNode {
  const sections = [
    data.overTime == null ? null : (
      <OverTimeSection key="over-time" overTime={data.overTime} />
    ),
    data.stages == null ? null : (
      <StagesSection key="stages" stages={data.stages} />
    ),
    data.perPerson == null ? null : (
      <PerPersonSection key="per-person" people={data.perPerson} />
    ),
    data.recent == null ? null : (
      <RecentSection key="recent" recent={data.recent} timeZone={timeZone} />
    ),
    data.hotWithoutFollowUp == null ? null : (
      <HotSection
        key="hot"
        companies={data.hotWithoutFollowUp}
        timeZone={timeZone}
      />
    ),
  ].filter((section) => section != null);
  return (
    <>
      <TodaySection today={data.today} timeZone={timeZone} />
      {sections.length === 0 ? null : (
        <div className="grid min-w-0 gap-6 lg:grid-cols-2">{sections}</div>
      )}
    </>
  );
}

function Screen({
  filters,
  asked,
  setSearch,
  timeZone,
}: {
  /** The figures on screen. */
  filters: MarketingDashboardFilters;
  /** What the controls ask for; the figures follow once they arrive. */
  asked: MarketingDashboardFilters;
  setSearch: SetSearch;
  timeZone: string;
}) {
  const { data } = useSuspenseQuery(marketingDashboardQuery(filters));
  const updating = JSON.stringify(asked) !== JSON.stringify(filters);
  return (
    <div className="min-w-0 space-y-6">
      <PageHeader
        title="Marketing Dashboard"
        meta={
          <>
            {whoseWords(data, filters.memberId)} · {periodWords(data.period)}
            {updating ? (
              <span className="ml-2" aria-live="polite">
                Updating…
              </span>
            ) : null}
          </>
        }
        actions={<Controls data={data} filters={asked} setSearch={setSearch} />}
      />
      <div
        className="min-w-0 space-y-6 transition-opacity data-[updating=true]:opacity-60 motion-reduce:transition-none"
        data-updating={updating}
      >
        <Totals
          totals={totalsOf(data, followUpsHref(data, filters.memberId))}
        />
        <Body data={data} timeZone={timeZone} />
      </div>
    </div>
  );
}

/**
 * The Marketing Dashboard (PRD §3.7, ADR CM-0040 §13): the viewer's own
 * figures, or with View all the team's or one Marketing Person's, over a
 * period kept in the address. Sections the Role cannot read come back
 * empty from the server and are left out. A new period or person keeps
 * the current figures on screen until the next ones arrive.
 */
export function MarketingDashboard({
  timeZone,
  ignorePerson = false,
}: {
  timeZone: string;
  /** The address's person was refused; the page fetched everyone's instead. */
  ignorePerson?: boolean;
}) {
  const [search, setSearch] = useQueryStates(MARKETING_DASHBOARD_SEARCH);
  const [refused] = useState(ignorePerson ? search.memberId : null);
  const filters = dashboardFilters({
    ...search,
    memberId: search.memberId === refused ? null : search.memberId,
  });
  useEffect(() => {
    if (refused != null) void setSearch({ memberId: null });
  }, [refused, setSearch]);

  const shown = useDeferredValue(JSON.stringify(filters));
  return (
    <div className="w-full min-w-0 p-4 sm:p-6">
      <div className="w-full max-w-7xl min-w-0">
        <Suspense
          fallback={
            <div className="space-y-6">
              <PageHeader title="Marketing Dashboard" />
              <MarketingDashboardSkeleton />
            </div>
          }
        >
          <Screen
            filters={JSON.parse(shown) as MarketingDashboardFilters}
            asked={filters}
            setSearch={setSearch}
            timeZone={timeZone}
          />
        </Suspense>
      </div>
    </div>
  );
}
