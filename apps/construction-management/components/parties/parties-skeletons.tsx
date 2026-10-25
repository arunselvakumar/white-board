import { Skeleton } from "@repo/ui/components/skeleton";
import {
  FormSkeleton,
  SkeletonGroup,
  SkeletonText,
  TableSkeleton,
  type SkeletonColumn,
} from "@repo/ui/components/skeleton-kit";

import {
  ChecklistSkeleton,
  FormPageSkeleton,
  FormSectionSkeleton,
} from "@/components/masters/masters-skeletons";

import type { PartyScreen } from "./party-screens";

/** Contractors, Suppliers and quotations while they load (ADR-0047). */

const ACTIONS: SkeletonColumn = {
  header: <span className="sr-only">Actions</span>,
  kind: "actions",
  className: "w-12",
};

/** The Contractors / Suppliers table; only Contractors have Departments. */
export function PartyRowsSkeleton({ screen }: { screen: PartyScreen }) {
  const columns: SkeletonColumn[] = [
    { header: "Name" },
    { header: "Contact", kind: "muted" },
    { header: "GST state", kind: "muted", className: "hidden md:table-cell" },
    ...(screen.departments
      ? [{ header: "Departments", kind: "muted" } as const]
      : []),
    { header: "Projects", kind: "muted" },
    { header: "Status", kind: "badge" },
    ACTIONS,
  ];
  return (
    <TableSkeleton count columns={columns} label={`Loading ${screen.plural}`} />
  );
}

const QUOTATION_COLUMNS: SkeletonColumn[] = [
  { header: "File" },
  { header: "Party", kind: "muted" },
  { header: "Kind", kind: "muted" },
  { header: "Date", kind: "muted" },
  { header: "Uploaded by", kind: "muted" },
  ACTIONS,
];

/** Masters → View Quotations. */
export function QuotationRowsSkeleton() {
  return (
    <TableSkeleton
      count
      columns={QUOTATION_COLUMNS}
      label="Loading quotations"
    />
  );
}

/** A party's own quotation files: icon, name, date, remove button. */
export function PartyQuotationListSkeleton() {
  return (
    <SkeletonGroup label="Loading quotations" className="block">
      <ul className="divide-border bg-card divide-y rounded-lg border">
        {["58%", "42%", "66%"].map((width) => (
          <li
            key={width}
            className="flex items-center gap-3 px-3 py-2.5 sm:px-4"
          >
            <Skeleton className="size-9 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1">
              <SkeletonText width={width} />
              <SkeletonText size="xs" width="30%" />
            </div>
            <Skeleton className="size-8 shrink-0 rounded-lg" />
          </li>
        ))}
      </ul>
    </SkeletonGroup>
  );
}

/** Edit Contractor / Edit Supplier while the party loads. */
export function PartyFormSkeleton({ screen }: { screen: PartyScreen }) {
  return (
    <FormPageSkeleton back={{ label: screen.plural, href: screen.path }}>
      <div className="space-y-6">
        <FormSectionSkeleton title="Details">
          <FormSkeleton
            columns={2}
            actions={0}
            label={`Loading ${screen.label}`}
            fields={[
              { label: `${screen.label} name` },
              { label: "Email" },
              { label: "Contact person" },
              { label: "Mobile" },
              { label: "GSTIN" },
              { label: "GST state", control: "select" },
              { label: "PAN" },
              { label: "Address", control: "textarea", wide: true },
            ]}
          />
        </FormSectionSkeleton>
        {screen.departments ? (
          <FormSectionSkeleton
            title="Departments"
            description="The trades this Contractor works in."
          >
            <ChecklistSkeleton label="Loading Departments" />
          </FormSectionSkeleton>
        ) : null}
        <FormSectionSkeleton
          title="Projects"
          description={`The ${screen.label} is on these Projects' Resources.`}
        >
          <ChecklistSkeleton />
        </FormSectionSkeleton>
      </div>
    </FormPageSkeleton>
  );
}
