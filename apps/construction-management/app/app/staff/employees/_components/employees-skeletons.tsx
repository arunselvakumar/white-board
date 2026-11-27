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
} from "@/app/app/_components/masters/masters-skeletons";
import { StaffPhotoSkeleton } from "@/app/app/staff/_components/staff-skeletons";
import { EMPLOYEES_PATH } from "@/lib/staff-nav";

/** The Employees screens while they load (ADR-0047). */

/** The Employees table; Balance shows only with the Financial flag. */
const EMPLOYEE_COLUMNS: SkeletonColumn[] = [
  {
    header: <span className="sr-only">Select</span>,
    kind: "checkbox",
    className: "w-10",
  },
  { header: "Name" },
  { header: "Employee Id", kind: "muted" },
  { header: "Role", kind: "muted" },
  { header: "Projects", kind: "muted" },
  { header: "Wage", kind: "muted" },
  { header: "Status", kind: "badge" },
  {
    header: <span className="sr-only">Actions</span>,
    kind: "actions",
    className: "w-12",
  },
];

export function EmployeeRowsSkeleton() {
  return (
    <div className="space-y-3">
      {/* The "N Employees" line sits in a min-h-9 bar beside the selection actions. */}
      <div aria-hidden="true" className="flex min-h-9 items-center">
        <SkeletonText width="5rem" />
      </div>
      <TableSkeleton columns={EMPLOYEE_COLUMNS} label="Loading Employees" />
    </div>
  );
}

/** Transfer history in its sheet: date, from, to, remark. */
export function TransferHistorySkeleton() {
  return (
    <SkeletonGroup label="Loading transfers" className="block space-y-3">
      {["62%", "48%", "70%"].map((width) => (
        <div key={width} className="bg-card rounded-lg border px-3 py-2.5">
          <SkeletonText size="xs" width="5.5rem" />
          <SkeletonText width={width} />
        </div>
      ))}
    </SkeletonGroup>
  );
}

/** Add and Edit Employee while the Employee, Roles and Departments load. */
export function EmployeeFormSkeleton() {
  return (
    <FormPageSkeleton back={{ label: "Employees", href: EMPLOYEES_PATH }} meta>
      <div className="space-y-6">
        <FormSectionSkeleton title="Photo & documents">
          <StaffPhotoSkeleton />
        </FormSectionSkeleton>
        <FormSectionSkeleton title="Basic">
          <FormSkeleton
            columns={2}
            actions={0}
            label="Loading Employee"
            fields={[
              { label: "Employee name" },
              { label: "Mobile" },
              { label: "Email" },
              { label: "Gender", control: "select" },
              { label: "Date of birth" },
              { label: "Father's name" },
              { label: "Blood group", control: "select" },
              { label: "Employee Id" },
              { label: "Joining date" },
            ]}
          />
        </FormSectionSkeleton>
        <FormSectionSkeleton title="Role assignment">
          <FormSkeleton
            columns={2}
            actions={0}
            fields={[
              { label: "Department", control: "select" },
              { label: "Role", control: "select" },
            ]}
          />
        </FormSectionSkeleton>
        <FormSectionSkeleton title="Details">
          <FormSkeleton
            columns={2}
            actions={0}
            fields={[
              { label: "Address" },
              { label: "Emergency contact" },
              { label: "Aadhaar" },
              { label: "PAN" },
              { label: "UAN" },
              { label: "ESIC number" },
            ]}
          />
        </FormSectionSkeleton>
        <FormSectionSkeleton title="Work">
          <FormSkeleton
            columns={2}
            actions={0}
            fields={[
              { label: "Qualification" },
              { label: "Experience (years)" },
              { label: "Labour Category", control: "select" },
              { label: "Reports To", control: "select" },
            ]}
          />
        </FormSectionSkeleton>
        <FormSectionSkeleton title="Wage">
          <FormSkeleton
            columns={2}
            actions={0}
            fields={[
              { label: "Wage per day" },
              { label: "Overtime wage per hour" },
              { label: "Working hours per day" },
              { label: "Opening balance" },
            ]}
          />
        </FormSectionSkeleton>
      </div>
    </FormPageSkeleton>
  );
}
