import {
  ItemListSkeleton,
  SkeletonGroup,
  SkeletonText,
  TableSkeleton,
  type SkeletonColumn,
} from "@repo/ui/components/skeleton-kit";

/** The list's columns; the loaded table and its skeleton share them. */
export const COMPANY_COLUMNS: SkeletonColumn[] = [
  { header: "Name", className: "min-w-48" },
  { header: "City", kind: "muted" },
  { header: "Stage", kind: "badge" },
  { header: "Assigned to", kind: "muted" },
  { header: "Primary Contact", kind: "muted" },
];

/** The count, then table rows (cards on a phone) while a filter loads (ADR-0047). */
export function CompanyRowsSkeleton() {
  return (
    <SkeletonGroup label="Loading Prospect Companies" className="space-y-3">
      <SkeletonText width="8rem" />
      <div className="hidden md:block">
        <TableSkeleton columns={COMPANY_COLUMNS} className="bg-card" />
      </div>
      <ItemListSkeleton
        rows={4}
        lines={2}
        trailing="badge"
        className="md:hidden"
      />
    </SkeletonGroup>
  );
}
