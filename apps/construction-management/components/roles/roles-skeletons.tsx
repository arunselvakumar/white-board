import { FormSkeleton } from "@repo/ui/components/skeleton-kit";

import { FormPageSkeleton } from "@/components/masters/masters-skeletons";
import { PermissionMatrixSkeleton } from "@/components/permissions/permissions-skeletons";
import { ROLES_PATH } from "@/lib/users-roles-nav";

/** Edit Role while it loads: name and description, then its matrix. */
export function RoleFormSkeleton() {
  return (
    <FormPageSkeleton
      back={{ label: "Role Management", href: ROLES_PATH }}
      meta
    >
      <div className="space-y-6">
        <FormSkeleton
          className="max-w-2xl"
          actions={0}
          label="Loading Role"
          fields={[{ label: "Role name" }, { label: "Description" }]}
        />
        <section className="space-y-2">
          <h2 className="font-semibold">Permission Matrix</h2>
          <PermissionMatrixSkeleton label="Loading the Role's permissions" />
        </section>
      </div>
    </FormPageSkeleton>
  );
}
