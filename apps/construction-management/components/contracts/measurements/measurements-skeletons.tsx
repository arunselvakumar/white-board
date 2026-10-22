import {
  SkeletonGroup,
  type SkeletonColumn,
} from "@repo/ui/components/skeleton-kit";

import { ResponsiveListSkeleton } from "@/components/finance/finance-skeletons";
import {
  FieldGridSkeleton,
  RecordHeaderSkeleton,
} from "@/components/sales/sales-form-skeletons";
import { measurementsPath } from "@/src/queries/contracts-measurements";

/* The Measurement Book while it loads (ADR-0047). */

export const MEASUREMENT_COLUMNS: SkeletonColumn[] = [
  { header: "Measured on" },
  { header: "Side" },
  { header: "Title", kind: "muted" },
  { header: "Rows", kind: "muted" },
  { header: "Joint measurement", kind: "muted" },
  { header: "Status", kind: "badge" },
];

export function MeasurementRowsSkeleton() {
  return (
    <ResponsiveListSkeleton
      label="Loading measurement sheets"
      count
      columns={MEASUREMENT_COLUMNS}
    />
  );
}

/** One sheet while it loads: the real back link, its header and rows. */
export function MeasurementSheetSkeleton({
  projectId,
  title,
}: {
  projectId: string;
  title?: string;
}) {
  return (
    <div className="flex w-full max-w-6xl min-w-0 flex-col gap-4">
      <RecordHeaderSkeleton
        back={{ label: "Measurements", href: measurementsPath(projectId) }}
        title={title}
      />
      <SkeletonGroup label="Loading the sheet" className="space-y-4">
        <FieldGridSkeleton
          fields={[
            { label: "Measured on" },
            { label: "Title" },
            { label: "Remarks", className: "sm:col-span-2", rows: 2 },
          ]}
          className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2"
        />
        <ResponsiveListSkeleton
          label="Loading rows"
          columns={[
            { header: "Item" },
            { header: "Description" },
            { header: "Nos", kind: "muted" },
            { header: "L", kind: "muted" },
            { header: "B", kind: "muted" },
            { header: "D / H", kind: "muted" },
            { header: "Quantity", kind: "muted" },
          ]}
          rows={3}
        />
      </SkeletonGroup>
    </div>
  );
}
