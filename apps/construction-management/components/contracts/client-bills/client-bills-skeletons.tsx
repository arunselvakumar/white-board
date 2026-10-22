import {
  SkeletonGroup,
  type SkeletonColumn,
} from "@repo/ui/components/skeleton-kit";

import { ResponsiveListSkeleton } from "@/components/finance/finance-skeletons";
import { RecordHeaderSkeleton } from "@/components/sales/sales-form-skeletons";
import { clientBillsPath } from "@/src/queries/contracts-client-bills";

/* Client Bills while they load (ADR-0047). */

export const CLIENT_BILL_COLUMNS: SkeletonColumn[] = [
  { header: "Number" },
  { header: "Bill date", kind: "muted" },
  { header: "Taxable value", kind: "muted" },
  { header: "GST", kind: "muted" },
  { header: "Net receivable", kind: "muted" },
  { header: "Status", kind: "badge" },
];

export function ClientBillRowsSkeleton() {
  return (
    <ResponsiveListSkeleton
      label="Loading Client Bills"
      count
      columns={CLIENT_BILL_COLUMNS}
    />
  );
}

/** One bill while it loads: the real back link, then its sections. */
export function ClientBillDetailSkeleton({ projectId }: { projectId: string }) {
  return (
    <div className="flex w-full max-w-5xl min-w-0 flex-col gap-4">
      <RecordHeaderSkeleton
        back={{ label: "Client Bills", href: clientBillsPath(projectId) }}
        title="Client Bill"
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
