import { FormSkeleton } from "@repo/ui/components/skeleton-kit";

import { FormPageSkeleton } from "@/components/masters/masters-skeletons";

/** Edit Designation while it loads: its name. */
export function DesignationFormSkeleton() {
  return (
    <FormPageSkeleton
      back={{ label: "Designations", href: "/app/masters/designations" }}
    >
      <div className="bg-card rounded-xl border p-4 sm:p-5">
        <FormSkeleton
          className="max-w-md"
          actions={0}
          label="Loading Designation"
          fields={[{ label: "Designation name" }]}
        />
      </div>
    </FormPageSkeleton>
  );
}
