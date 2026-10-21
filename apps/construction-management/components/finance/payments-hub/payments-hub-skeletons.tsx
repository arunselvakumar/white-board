import {
  SkeletonGroup,
  SkeletonText,
  TableSkeleton,
} from "@repo/ui/components/skeleton-kit";

/**
 * Payments while it finds the first tab the member may open and moves
 * there: a heading and a list, the shape every Payments tab has.
 */
export function PaymentsIndexSkeleton() {
  return (
    <SkeletonGroup label="Loading Payments" className="flex flex-col gap-4">
      <SkeletonText size="lg" width="10rem" />
      <TableSkeleton
        columns={[
          { header: <SkeletonText width="4rem" /> },
          { header: <SkeletonText width="5rem" />, kind: "muted" },
          { header: <SkeletonText width="4rem" />, kind: "muted" },
          {
            header: <SkeletonText width="4rem" className="ml-auto" />,
            kind: "number",
            className: "text-right",
          },
        ]}
      />
    </SkeletonGroup>
  );
}
