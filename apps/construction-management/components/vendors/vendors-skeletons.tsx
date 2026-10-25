import { Skeleton } from "@repo/ui/components/skeleton";
import {
  FormSkeleton,
  SkeletonGroup,
  TableSkeleton,
  type SkeletonColumn,
} from "@repo/ui/components/skeleton-kit";

import {
  ChecklistSkeleton,
  FormPageSkeleton,
  FormSectionSkeleton,
} from "@/components/masters/masters-skeletons";

/** Masters → Vendors while it loads (ADR-0047). */

/** The Vendors table's columns; Balance shows only with the Financial flag. */
const VENDOR_COLUMNS: SkeletonColumn[] = [
  { header: "Name" },
  { header: "Contact", kind: "muted" },
  { header: "Projects", kind: "muted" },
  { header: "Shifts", kind: "number", className: "text-right" },
  { header: "Status", kind: "badge" },
  {
    header: <span className="sr-only">Actions</span>,
    kind: "actions",
    className: "w-12",
  },
];

export function VendorRowsSkeleton() {
  return (
    <TableSkeleton count columns={VENDOR_COLUMNS} label="Loading Vendors" />
  );
}

/** The Project filter's select, `w-full sm:w-56`. */
export function ProjectFilterSkeleton() {
  return (
    <SkeletonGroup label="Loading Projects" className="w-full sm:w-56">
      <Skeleton className="h-10 w-full rounded-lg" />
    </SkeletonGroup>
  );
}

/** Edit Vendor while the Vendor loads: details, Projects, rate card. */
export function VendorFormSkeleton() {
  return (
    <FormPageSkeleton back={{ label: "Vendors", href: "/app/masters/vendors" }}>
      <div className="space-y-8">
        <FormSectionSkeleton title="Details">
          <FormSkeleton
            columns={2}
            actions={0}
            label="Loading Vendor"
            fields={[
              { label: "Vendor name" },
              { label: "Joining date" },
              { label: "Contact number" },
              { label: "Opening balance" },
              { label: "Address", control: "textarea", wide: true },
            ]}
          />
        </FormSectionSkeleton>
        <FormSectionSkeleton
          title="Projects"
          description="The Vendor appears on the attendance screen of these Projects."
        >
          <ChecklistSkeleton />
        </FormSectionSkeleton>
        <FormSectionSkeleton title="Rate card">
          <FormSkeleton
            columns={2}
            actions={2}
            fields={[
              { label: "Shift name", wide: true },
              { label: "Start time" },
              { label: "End time" },
            ]}
          />
        </FormSectionSkeleton>
      </div>
    </FormPageSkeleton>
  );
}
