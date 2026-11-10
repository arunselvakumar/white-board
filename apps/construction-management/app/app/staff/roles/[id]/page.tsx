import type { Metadata } from "next";

import { QuerySuspense } from "@/components/query-suspense";
import { EditRoleScreen } from "@/app/app/staff/roles/_components/role-form";
import { RolesNoAccess } from "@/app/app/staff/_components/roles-no-access";
import { RoleFormSkeleton } from "@/app/app/staff/roles/[id]/_components/roles-skeletons";

import { viewerRoleActions } from "../_lib/role-actions";

export const metadata: Metadata = { title: "Edit Role" };

export default async function EditRolePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actions = await viewerRoleActions();
  if (!actions.read) return <RolesNoAccess what="Role Management" />;
  return (
    <QuerySuspense fallback={<RoleFormSkeleton />}>
      <EditRoleScreen id={id} canUpdate={actions.update} />
    </QuerySuspense>
  );
}
