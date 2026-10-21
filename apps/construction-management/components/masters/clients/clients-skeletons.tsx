import type { SkeletonColumn } from "@repo/ui/components/skeleton-kit";

import {
  ResponsiveListSkeleton,
  srOnly,
} from "@/components/finance/finance-skeletons";

export const CLIENT_COLUMNS: SkeletonColumn[] = [
  { header: "Name" },
  { header: "Contact", kind: "muted" },
  { header: "GSTIN", kind: "muted" },
  { header: "Status", kind: "muted" },
  { header: srOnly("Actions"), kind: "actions", className: "w-32" },
];

/** Clients while they load: the count, the table, cards on a phone. */
export function ClientRowsSkeleton() {
  return (
    <ResponsiveListSkeleton
      label="Loading Clients"
      count
      columns={CLIENT_COLUMNS}
    />
  );
}
