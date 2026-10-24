import type { Metadata } from "next";

import { RolesList } from "@/components/roles/roles-list";

import { viewerRoleActions } from "./_lib/role-actions";

export const metadata: Metadata = { title: "Role Management" };

export default async function RolesPage() {
  return <RolesList actions={await viewerRoleActions()} />;
}
