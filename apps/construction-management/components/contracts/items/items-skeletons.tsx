import type { SkeletonColumn } from "@repo/ui/components/skeleton-kit";

import {
  ResponsiveListSkeleton,
  srOnly,
} from "@/components/finance/finance-skeletons";

export const ITEM_COLUMNS: SkeletonColumn[] = [
  { header: "Code" },
  { header: "Item" },
  { header: "UoM", kind: "muted" },
  { header: "Adopted rate", kind: "muted", className: "text-right" },
  { header: "Analysed rate", kind: "muted", className: "text-right" },
  { header: srOnly("Actions"), kind: "actions", className: "w-32" },
];

/** Items while they load: the count, the table, cards on a phone. */
export function ItemRowsSkeleton() {
  return (
    <ResponsiveListSkeleton
      label="Loading Items"
      count
      columns={ITEM_COLUMNS}
    />
  );
}
