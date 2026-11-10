import type { Metadata } from "next";

import { RolesList } from "@/components/roles/roles-list";
import { RolesNoAccess } from "@/components/roles/roles-no-access";

import { viewerRoleActions } from "./_lib/role-actions";

export const metadata: Metadata = { title: "Role Management" };

export default async function RolesPage() {
  const actions = await viewerRoleActions();
  if (!actions.read) return <RolesNoAccess what="Role Management" />;
  return <RolesList actions={actions} />;
}
