import type { Metadata } from "next";

import { NewRoleScreen } from "@/app/app/staff/roles/_components/role-form";
import { RolesNoAccess } from "@/app/app/staff/_components/roles-no-access";

import { viewerRoleActions } from "../_lib/role-actions";

export const metadata: Metadata = { title: "Add Role" };

export default async function NewRolePage() {
  const actions = await viewerRoleActions();
  if (!actions.create) return <RolesNoAccess what="adding Roles" />;
  return <NewRoleScreen />;
}
