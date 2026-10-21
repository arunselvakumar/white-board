import { FormSkeleton } from "@repo/ui/components/skeleton-kit";

import { FormPageSkeleton } from "@/components/masters/masters-skeletons";
import { PermissionMatrixSkeleton } from "@/components/permissions/permissions-skeletons";

/** Edit Designation while it loads: the name, then its Permission Template. */
export function DesignationFormSkeleton() {
  return (
    <FormPageSkeleton
      back={{ label: "Designations", href: "/app/masters/designations" }}
    >
      <div className="space-y-6">
        <FormSkeleton
          className="max-w-md"
          actions={0}
          label="Loading Designation"
          fields={[{ label: "Designation name" }]}
        />
        <section className="space-y-2">
          <div className="space-y-1">
            <h2 className="font-semibold">Permission Template</h2>
            <p className="text-muted-foreground text-sm">
              A new Team Member with this Designation starts with these
              permissions. Leave it empty for no template.
            </p>
          </div>
          <PermissionMatrixSkeleton label="Loading Permission Template" />
        </section>
      </div>
    </FormPageSkeleton>
  );
}
