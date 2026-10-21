import { Skeleton } from "@repo/ui/components/skeleton";
import {
  SkeletonGroup,
  SkeletonText,
  type SkeletonColumn,
} from "@repo/ui/components/skeleton-kit";

import {
  ResponsiveListSkeleton,
  srOnly,
} from "@/components/finance/finance-skeletons";

export const OTHER_PARTY_COLUMNS: SkeletonColumn[] = [
  { header: "Name" },
  { header: "Contact", kind: "muted" },
  { header: "GSTIN", kind: "muted" },
  { header: "Projects", kind: "muted" },
  { header: srOnly("Actions"), kind: "actions", className: "w-32" },
];

/** Other Parties while they load: the count, the table, cards on a phone. */
export function OtherPartyRowsSkeleton() {
  return (
    <ResponsiveListSkeleton
      label="Loading Other Parties"
      count
      columns={OTHER_PARTY_COLUMNS}
    />
  );
}

/** The form's Projects check list while the Projects load. */
export function ProjectsChecklistSkeleton() {
  return (
    <SkeletonGroup label="Loading Projects">
      <ul className="bg-card divide-y rounded-xl border">
        {["58%", "44%", "66%"].map((width, row) => (
          <li key={row} className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="size-4 shrink-0 rounded-[4px]" />
            <SkeletonText width={width} />
          </li>
        ))}
      </ul>
    </SkeletonGroup>
  );
}
