import { Skeleton } from "@repo/ui/components/skeleton";
import {
  CalendarGridSkeleton,
  SkeletonGroup,
  SkeletonText,
  TableSkeleton,
} from "@repo/ui/components/skeleton-kit";

import { SummaryTilesSkeleton } from "@/components/finance/finance-skeletons";

/*
 * HRMS pages while they load (ADR-0047), under the real HRMS tabs. The
 * page's own title is known from the HRMS menu, so it renders for real.
 *
 * `SkeletonGroup` wraps its bars in a `display: contents` box, so spacing
 * between them uses flex `gap`, which reaches through it; `space-y` doesn't.
 */

const WIDTHS = ["62%", "48%", "70%", "55%", "66%"];

/** A divided list in a card: a short leading column, a title and a meta line. */
export function HrmsRowsSkeleton({
  label = "Loading",
  rows = 4,
  lead = true,
  trailing = true,
}: {
  label?: string;
  rows?: number;
  /** A date or day column before the title. */
  lead?: boolean;
  /** A badge or button at the row's end. */
  trailing?: boolean;
}) {
  return (
    <SkeletonGroup label={label}>
      <ul className="bg-card divide-y rounded-xl border">
        {Array.from({ length: rows }, (_, row) => (
          <li key={row} className="flex items-center gap-3 px-4 py-3">
            {lead ? <SkeletonText width="5rem" className="shrink-0" /> : null}
            <div className="min-w-0 flex-1 space-y-1">
              <SkeletonText width={WIDTHS[row % WIDTHS.length]} />
              <SkeletonText size="xs" width="35%" />
            </div>
            {trailing ? (
              <Skeleton className="h-5 w-16 shrink-0 rounded-full" />
            ) : null}
          </li>
        ))}
      </ul>
    </SkeletonGroup>
  );
}

/**
 * An HRMS page loading under the tabs: the `HrmsPage` frame with the
 * page's real title, a bar for its description, then a list.
 */
export function HrmsPageFallback({ title }: { title?: string }) {
  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-1">
            {title == null ? (
              <SkeletonGroup label="Loading">
                <SkeletonText size="xl" width="12rem" />
              </SkeletonGroup>
            ) : (
              <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
            )}
            <SkeletonGroup label={`Loading ${title ?? "the page"}`}>
              <SkeletonText width="min(28rem, 80vw)" />
            </SkeletonGroup>
          </div>
        </div>
        <HrmsRowsSkeleton label={`Loading ${title ?? "the page"}`} />
      </div>
    </div>
  );
}

/** An HRMS read inside its page, under the page's real heading. */
export function AttendanceReadSkeleton({ what }: { what: string }) {
  return (
    <SkeletonGroup label={`Loading ${what}`} className="flex flex-col gap-3">
      <SkeletonText width="12rem" />
      <TableSkeleton
        bordered
        columns={[
          { header: <SkeletonText width="6rem" /> },
          { header: <SkeletonText width="4rem" />, kind: "muted" },
          { header: <SkeletonText width="4rem" />, kind: "muted" },
          { header: null, kind: "badge", className: "w-24" },
        ]}
      />
    </SkeletonGroup>
  );
}

const MONTH_TOTALS = ["P", "HD", "A", "L", "H", "WO", "Late", "Hours", "OT h"];

/** "1" … "31" for a `YYYY-MM` month. */
function dayHeaders(month: string): string[] {
  const [year, monthIndex] = month.split("-").map(Number);
  const days =
    year == null || monthIndex == null
      ? 31
      : new Date(Date.UTC(year, monthIndex, 0)).getUTCDate();
  return Array.from({ length: days }, (_, day) => String(day + 1));
}

/** Monthly Attendance: every day of the month and the totals, as columns. */
export function MonthlyAttendanceSkeleton({ month }: { month: string }) {
  return (
    <div className="space-y-2">
      <SkeletonGroup label="Loading the monthly attendance">
        <SkeletonText width="14rem" />
      </SkeletonGroup>
      <div className="overflow-x-auto">
        <CalendarGridSkeleton
          label="Loading the monthly attendance"
          nameHeader="Team Member"
          headers={[...dayHeaders(month), ...MONTH_TOTALS]}
        />
      </div>
    </div>
  );
}

/** A Holidays year: the list heading, then the holidays. */
export function HolidayYearSkeleton() {
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <SkeletonGroup label="Loading holidays">
          <SkeletonText size="base" width="9rem" />
        </SkeletonGroup>
        <HrmsRowsSkeleton label="Loading holidays" trailing={false} />
      </section>
    </div>
  );
}

/** Team Salary's month: the four totals, then a row per member. */
export function TeamSalaryMonthSkeleton() {
  return (
    <SkeletonGroup
      label="Loading the month's salaries"
      className="flex flex-col gap-4"
    >
      <SummaryTilesSkeleton
        labels={["Gross", "Deductions", "Net payable", "Employer PF / ESI"]}
      />
      <HrmsRowsSkeleton label="Loading salaries" lead={false} />
    </SkeletonGroup>
  );
}

/** My Salary: the real title over the month-by-month slips. */
export function MySalarySkeleton() {
  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        <div className="min-w-0 space-y-1">
          <h2 className="text-xl font-semibold tracking-tight">My Salary</h2>
          <p className="text-muted-foreground text-sm">
            Your salary month by month, once it is approved.
          </p>
        </div>
        <HrmsRowsSkeleton label="Loading your salary" rows={3} lead={false} />
      </div>
    </div>
  );
}

/** Team leaves by day: a date, then the people away that day. */
export function TeamLeavesSkeleton() {
  return (
    <SkeletonGroup label="Loading leaves">
      <ul className="bg-card divide-y rounded-xl border">
        {[0, 1, 2].map((row) => (
          <li
            key={row}
            className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:gap-4"
          >
            <SkeletonText width="6rem" className="w-28 shrink-0" />
            <div className="flex min-w-0 flex-1 flex-wrap gap-2">
              <Skeleton className="h-7 w-32 rounded-lg" />
              <Skeleton className="h-7 w-24 rounded-lg" />
            </div>
          </li>
        ))}
      </ul>
    </SkeletonGroup>
  );
}

/** A member's leave credits in the history sheet. */
export function CreditListSkeleton() {
  return (
    <SkeletonGroup label="Loading credits">
      <ul className="divide-y rounded-xl border">
        {WIDTHS.slice(0, 3).map((width, row) => (
          <li key={row} className="flex items-start gap-3 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <SkeletonText width={width} />
              <SkeletonText size="xs" width="40%" />
            </div>
            <SkeletonText width="3rem" />
          </li>
        ))}
      </ul>
    </SkeletonGroup>
  );
}

/** The fence map while its script loads: the map's own height. */
export function FenceMapSkeleton() {
  return (
    <SkeletonGroup label="Loading the map">
      <Skeleton className="h-64 w-full rounded-lg sm:h-72" />
    </SkeletonGroup>
  );
}
