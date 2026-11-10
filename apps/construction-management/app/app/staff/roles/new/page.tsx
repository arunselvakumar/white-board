import type { Metadata } from "next";

import { NewRoleScreen } from "@/components/roles/role-form";
import { RolesNoAccess } from "@/components/roles/roles-no-access";

import { viewerRoleActions } from "../_lib/role-actions";

export const metadata: Metadata = { title: "Add Role" };

export default async function NewRolePage() {
  const actions = await viewerRoleActions();
  if (!actions.create) return <RolesNoAccess what="adding Roles" />;
  return <NewRoleScreen />;
}
