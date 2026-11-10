import type { Metadata } from "next";

import { RolesList } from "@/app/app/staff/roles/_components/roles-list";
import { RolesNoAccess } from "@/app/app/staff/_components/roles-no-access";

import { viewerRoleActions } from "./_lib/role-actions";

export const metadata: Metadata = { title: "Role Management" };

export default async function RolesPage() {
  const actions = await viewerRoleActions();
  if (!actions.read) return <RolesNoAccess what="Role Management" />;
  return <RolesList actions={actions} />;
}
