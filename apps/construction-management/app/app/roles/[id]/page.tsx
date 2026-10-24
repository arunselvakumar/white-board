import type { Metadata } from "next";

import { QuerySuspense } from "@/components/query-suspense";
import { EditRoleScreen } from "@/components/roles/role-form";
import { RoleFormSkeleton } from "@/components/roles/roles-skeletons";

import { viewerRoleActions } from "../_lib/role-actions";

export const metadata: Metadata = { title: "Edit Role" };

export default async function EditRolePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actions = await viewerRoleActions();
  return (
    <QuerySuspense fallback={<RoleFormSkeleton />}>
      <EditRoleScreen id={id} canUpdate={actions.update} />
    </QuerySuspense>
  );
}
