import { Card, CardContent, CardHeader } from "@repo/ui/components/card";
import { Skeleton } from "@repo/ui/components/skeleton";
import {
  CalendarGridSkeleton,
  SkeletonGroup,
  SkeletonText,
  TableSkeleton,
  type SkeletonColumn,
} from "@repo/ui/components/skeleton-kit";

import { ResponsiveListSkeleton } from "@/components/finance/finance-skeletons";

/*
 * Labour and vendor attendance while they load (ADR-0047). Month grids keep
 * their real day and totals columns, so nothing moves when the codes land.
 *
 * `SkeletonGroup` wraps its bars in a `display: contents` box, so spacing
 * between them uses flex `gap`, which reaches through it; `space-y` doesn't.
 */

const WIDTHS = ["62%", "48%", "70%", "55%", "66%"];

/** "1" … "31" for a `YYYY-MM` month. */
export function dayHeaders(month: string): string[] {
  const [year, monthIndex] = month.split("-").map(Number);
  const days =
    year == null || monthIndex == null
      ? 31
      : new Date(Date.UTC(year, monthIndex, 0)).getUTCDate();
  return Array.from({ length: days }, (_, day) => String(day + 1));
}

export const LABOUR_MONTH_TOTALS = [
  "P",
  "H",
  "A",
  "L",
  "PL",
  "HO",
  "OT h",
  "Earned",
];
export const VENDOR_MONTH_TOTALS = ["Full", "Half", "OT h", "Pay"];

/** A month grid: the name column, one column per day, then the totals. */
export function MonthGridSkeleton({
  month,
  nameHeader,
  totals,
  legend,
  label,
}: {
  month: string;
  nameHeader: string;
  totals: string[];
  legend?: string;
  label: string;
}) {
  return (
    <div className="space-y-2">
      {legend == null ? null : (
        <p className="text-muted-foreground text-xs">{legend}</p>
      )}
      <div className="overflow-x-auto">
        <CalendarGridSkeleton
          label={label}
          nameHeader={nameHeader}
          headers={[...dayHeaders(month), ...totals]}
        />
      </div>
    </div>
  );
}

/** Mark: one card per Labour with the status buttons and the shift. */
export function LabourMarkingSheetSkeleton() {
  return (
    <SkeletonGroup
      label="Loading the day's sheet"
      className="flex flex-col gap-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SkeletonText width="10rem" />
        <Skeleton className="h-9 w-32 rounded-md" />
      </div>
      <ul className="space-y-2">
        {WIDTHS.slice(0, 3).map((width, row) => (
          <li key={row} className="bg-card space-y-3 rounded-xl border p-3">
            <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[auto_minmax(10rem,1fr)_auto_9rem_12rem] lg:items-center">
              <div className="flex items-start gap-3 lg:contents">
                <Skeleton className="mt-1 size-5 rounded-[4px] lg:mt-0" />
                <div className="min-w-0 flex-1">
                  <SkeletonText size="base" width={width} />
                  <SkeletonText size="xs" width="45%" />
                </div>
              </div>
              <Skeleton className="h-10 w-full rounded-md lg:w-64" />
              <Skeleton className="h-10 w-full rounded-md" />
              <Skeleton className="h-10 w-full rounded-md" />
            </div>
          </li>
        ))}
      </ul>
    </SkeletonGroup>
  );
}

export const LABOUR_RECORDED_COLUMNS: SkeletonColumn[] = [
  { header: "Date", kind: "muted" },
  { header: "Labour" },
  { header: "Status", kind: "badge" },
  { header: "Shift", kind: "muted" },
  { header: "Supervisor", kind: "muted" },
  { header: "In", kind: "muted" },
  { header: "Out", kind: "muted" },
  { header: "Worked h", kind: "number", className: "text-right" },
  { header: "OT h", kind: "number", className: "text-right" },
  { header: "Wages", kind: "number", className: "text-right" },
  { header: null, kind: "actions" },
];

/** Recorded days under the real filters: the count, then the list. */
export function LabourRecordedSkeleton() {
  return (
    <ResponsiveListSkeleton
      label="Loading recorded days"
      count
      breakpoint="lg"
      columns={LABOUR_RECORDED_COLUMNS}
    />
  );
}

/** Vendor Day: the day's totals line, then a card per vendor in two columns. */
export function VendorDayGridSkeleton() {
  return (
    <SkeletonGroup label="Loading vendors" className="flex flex-col gap-4">
      <SkeletonText width="14rem" />
      <div className="grid gap-4 lg:grid-cols-2">
        {WIDTHS.slice(0, 2).map((width, card) => (
          <Card key={card}>
            <CardHeader>
              <SkeletonText size="base" width={width} />
              <SkeletonText width="40%" />
            </CardHeader>
            <CardContent className="space-y-3">
              {[0, 1].map((row) => (
                <div key={row} className="space-y-2">
                  <SkeletonText width="35%" />
                  <div className="grid grid-cols-3 gap-2">
                    <Skeleton className="h-10 rounded-md" />
                    <Skeleton className="h-10 rounded-md" />
                    <Skeleton className="h-10 rounded-md" />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </SkeletonGroup>
  );
}

export const VENDOR_OVERTIME_COLUMNS: SkeletonColumn[] = [
  { header: "Date", kind: "muted" },
  { header: "Vendor" },
  { header: "Shift", kind: "muted" },
  { header: "Labour Category", kind: "muted" },
  { header: "Hours", kind: "number", className: "text-right" },
  { header: "Rate/h", kind: "number", className: "text-right" },
  { header: "Amount", kind: "number", className: "text-right" },
];

export function VendorOvertimeSkeleton() {
  return (
    <div className="overflow-x-auto">
      <TableSkeleton
        label="Loading overtime"
        columns={VENDOR_OVERTIME_COLUMNS}
      />
    </div>
  );
}
