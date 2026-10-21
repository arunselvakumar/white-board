import { Skeleton } from "@repo/ui/components/skeleton";
import {
  FormSkeleton,
  SkeletonGroup,
  SkeletonText,
  TableSkeleton,
  type SkeletonColumn,
} from "@repo/ui/components/skeleton-kit";

import {
  FormPageSkeleton,
  FormSectionSkeleton,
} from "@/components/masters/masters-skeletons";

/** Masters → Labours while it loads (ADR-0047). */

/** The Labours table; Balance shows only with the Financial flag. */
const LABOUR_COLUMNS: SkeletonColumn[] = [
  {
    header: <span className="sr-only">Select</span>,
    kind: "checkbox",
    className: "w-10",
  },
  { header: "Name" },
  { header: "Labour Id", kind: "muted" },
  { header: "Category", kind: "muted" },
  { header: "Project", kind: "muted" },
  { header: "Wage", kind: "muted" },
  { header: "Status", kind: "badge" },
  {
    header: <span className="sr-only">Actions</span>,
    kind: "actions",
    className: "w-12",
  },
];

export function LabourRowsSkeleton() {
  return (
    <div className="space-y-3">
      {/* The "N Labours" line sits in a min-h-9 bar beside the selection actions. */}
      <div aria-hidden="true" className="flex min-h-9 items-center">
        <SkeletonText width="5rem" />
      </div>
      <TableSkeleton columns={LABOUR_COLUMNS} label="Loading Labours" />
    </div>
  );
}

/** Transfer history in its sheet: date, from → to, remark. */
export function TransferHistorySkeleton() {
  return (
    <SkeletonGroup label="Loading transfers" className="block space-y-3">
      {["62%", "48%", "70%"].map((width) => (
        <div key={width} className="rounded-lg border px-3 py-2.5">
          <SkeletonText size="xs" width="5.5rem" />
          <SkeletonText width={width} />
        </div>
      ))}
    </SkeletonGroup>
  );
}

/** A Labour's documents: icon, file name, size, remove. */
export function LabourFilesSkeleton() {
  return (
    <SkeletonGroup label="Loading documents" className="block">
      <ul className="divide-border divide-y rounded-lg border">
        {["54%", "38%"].map((width) => (
          <li key={width} className="flex items-center gap-3 px-4 py-2.5">
            <Skeleton className="size-4 shrink-0 rounded-sm" />
            <SkeletonText width={width} className="flex-1" />
            <SkeletonText size="xs" width="3rem" />
            <Skeleton className="size-8 shrink-0 rounded-lg" />
          </li>
        ))}
      </ul>
    </SkeletonGroup>
  );
}

/** Edit Labour while the Labour loads. */
export function LabourFormSkeleton() {
  return (
    <FormPageSkeleton
      back={{ label: "Labours", href: "/app/masters/labours" }}
      meta
    >
      <div className="space-y-8">
        <FormSectionSkeleton title="Basic">
          <FormSkeleton
            columns={2}
            actions={0}
            label="Loading Labour"
            fields={[
              { label: "Labour name" },
              { label: "Labour Id" },
              { label: "Father's name" },
              { label: "Joining date" },
            ]}
          />
        </FormSectionSkeleton>
        <FormSectionSkeleton title="Wage">
          <FormSkeleton
            columns={2}
            actions={0}
            fields={[
              { label: "Wage per day" },
              { label: "Wage per month" },
              { label: "Overtime wage per hour" },
              { label: "Working hours per day" },
            ]}
          />
        </FormSectionSkeleton>
        <FormSectionSkeleton title="Statutory">
          <FormSkeleton
            columns={2}
            actions={0}
            fields={[
              { label: "UAN" },
              { label: "ESIC number" },
              { label: "Aadhaar" },
            ]}
          />
        </FormSectionSkeleton>
        <FormSectionSkeleton title="Category & contact">
          <FormSkeleton
            columns={2}
            fields={[
              { label: "Labour Category", control: "select" },
              { label: "Supervisor", control: "select" },
              { label: "Gender", control: "select" },
            ]}
          />
        </FormSectionSkeleton>
      </div>
    </FormPageSkeleton>
  );
}
