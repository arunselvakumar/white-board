import {
  SkeletonGroup,
  type SkeletonColumn,
} from "@repo/ui/components/skeleton-kit";

import { ResponsiveListSkeleton } from "@/components/finance/finance-skeletons";
import { RecordHeaderSkeleton } from "@/components/sales/sales-form-skeletons";
import { contractorBillsPath } from "@/src/queries/contracts-contractor-bills";

/* Contractor Bills while they load (ADR-0047). */

export const CONTRACTOR_BILL_COLUMNS: SkeletonColumn[] = [
  { header: "Number" },
  { header: "Contractor" },
  { header: "Bill date", kind: "muted" },
  { header: "Gross", kind: "muted" },
  { header: "Net", kind: "muted" },
  { header: "Status", kind: "badge" },
];

export function ContractorBillRowsSkeleton() {
  return (
    <ResponsiveListSkeleton
      label="Loading Contractor Bills"
      count
      columns={CONTRACTOR_BILL_COLUMNS}
    />
  );
}

/** One bill while it loads: the real back link, then its sections. */
export function ContractorBillDetailSkeleton({
  projectId,
}: {
  projectId: string;
}) {
  return (
    <div className="flex w-full max-w-5xl min-w-0 flex-col gap-4">
      <RecordHeaderSkeleton
        back={{
          label: "Contractor Bills",
          href: contractorBillsPath(projectId),
        }}
        title="Contractor Bill"
      />
      <SkeletonGroup label="Loading the bill" className="space-y-4">
        <ResponsiveListSkeleton
          label="Loading the abstract"
          columns={[
            { header: "Item" },
            { header: "Description" },
            { header: "Previous", kind: "muted" },
            { header: "This bill", kind: "muted" },
            { header: "Cumulative", kind: "muted" },
            { header: "Amount", kind: "muted" },
          ]}
        />
      </SkeletonGroup>
    </div>
  );
}
