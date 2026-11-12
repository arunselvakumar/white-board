import {
  ItemListSkeleton,
  SkeletonGroup,
  SkeletonText,
  TableSkeleton,
  type SkeletonColumn,
} from "@repo/ui/components/skeleton-kit";

/** The list's columns; the loaded table and its skeleton share them. */
export const VISIT_COLUMNS: SkeletonColumn[] = [
  { header: "Visit No.", className: "w-28" },
  { header: "Date and time", kind: "muted", className: "min-w-40" },
  { header: "Prospect Company", className: "min-w-48" },
  { header: "Visited by", kind: "muted" },
  { header: "Points of contact", kind: "muted" },
  { header: "Purpose", kind: "muted" },
  { header: "Status", kind: "badge" },
  { header: "Interest", kind: "badge" },
];

/** The count, then table rows (cards on a phone) while a filter loads (ADR-0047). */
export function VisitRowsSkeleton() {
  return (
    <SkeletonGroup label="Loading Visits" className="space-y-3">
      <SkeletonText width="6rem" />
      <div className="hidden md:block">
        <TableSkeleton columns={VISIT_COLUMNS} className="bg-card" />
      </div>
      <ItemListSkeleton
        rows={4}
        lines={3}
        trailing="badge"
        className="md:hidden"
      />
    </SkeletonGroup>
  );
}

/** Six weeks of days while the calendar's Visits load (ADR-0047). */
export function VisitCalendarSkeleton() {
  return (
    <SkeletonGroup
      label="Loading the calendar"
      className="bg-card overflow-hidden rounded-lg border"
    >
      <div aria-hidden="true" className="grid grid-cols-7">
        {Array.from({ length: 42 }, (_, index) => (
          <div
            key={index}
            className="min-h-14 border-r border-b p-1.5 sm:min-h-28 [&:nth-child(7n)]:border-r-0"
          >
            <SkeletonText size="xs" width="1.25rem" />
          </div>
        ))}
      </div>
    </SkeletonGroup>
  );
}
