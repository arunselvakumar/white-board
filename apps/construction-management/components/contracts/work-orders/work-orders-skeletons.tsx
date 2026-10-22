import {
  SkeletonGroup,
  type SkeletonColumn,
} from "@repo/ui/components/skeleton-kit";

import { ResponsiveListSkeleton } from "@/components/finance/finance-skeletons";
import {
  FieldGridSkeleton,
  FormActionsSkeleton,
  RecordHeaderSkeleton,
} from "@/components/sales/sales-form-skeletons";
import { workOrdersPath } from "@/src/queries/contracts-work-orders";

/* Work Orders while they load (ADR-0047). */

export const WORK_ORDER_COLUMNS: SkeletonColumn[] = [
  { header: "Number" },
  { header: "Contractor" },
  { header: "Order date", kind: "muted" },
  { header: "Scope", kind: "muted" },
  { header: "Value", kind: "muted" },
  { header: "Status", kind: "badge" },
];

export function WorkOrderRowsSkeleton() {
  return (
    <ResponsiveListSkeleton
      label="Loading Work Orders"
      count
      columns={WORK_ORDER_COLUMNS}
    />
  );
}

const HEADER_FIELDS = [
  { label: "Contractor" },
  { label: "Department" },
  { label: "Order date" },
  { label: "Valid until" },
  { label: "Scope", className: "sm:col-span-2", rows: 3 },
];

/** The form while its options load: the real back link and title, the cards' fields. */
export function WorkOrderFormSkeleton({
  projectId,
  title,
}: {
  projectId: string;
  title: string;
}) {
  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <div className="w-full max-w-4xl">
        <RecordHeaderSkeleton
          back={{ label: "Work Orders", href: workOrdersPath(projectId) }}
          title={title}
        />
      </div>
      <SkeletonGroup
        label="Loading the form"
        className="w-full max-w-4xl space-y-4"
      >
        <FieldGridSkeleton
          fields={HEADER_FIELDS}
          className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2"
        />
        <FieldGridSkeleton
          fields={[
            { label: "Retention %" },
            { label: "Retention cap %" },
            { label: "DLP (months)" },
            { label: "TDS nature" },
          ]}
          className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2"
        />
        <FormActionsSkeleton />
      </SkeletonGroup>
    </div>
  );
}

/** One Work Order while it loads: the real back link, its facts and lines. */
export function WorkOrderDetailSkeleton({ projectId }: { projectId: string }) {
  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <RecordHeaderSkeleton
        back={{ label: "Work Orders", href: workOrdersPath(projectId) }}
      />
      <SkeletonGroup label="Loading the Work Order" className="space-y-4">
        <FieldGridSkeleton
          fields={[
            { label: "Contractor" },
            { label: "Order date" },
            { label: "Valid until" },
            { label: "Value" },
          ]}
          className="grid gap-4 rounded-xl border p-4 sm:grid-cols-4"
        />
        <ResponsiveListSkeleton
          label="Loading lines"
          columns={[
            { header: "Item no" },
            { header: "Description" },
            { header: "Qty", kind: "muted" },
            { header: "Rate", kind: "muted" },
            { header: "Amount", kind: "muted" },
          ]}
          rows={3}
        />
      </SkeletonGroup>
    </div>
  );
}
