import type { Metadata } from "next";

import { RolesNoAccess } from "@/components/roles/roles-no-access";
import { TeamMembersPage } from "@/components/team-members/team-members-page";

import { viewerFlags } from "../_lib/viewer-can";

export const metadata: Metadata = { title: "Users" };

export default async function Page() {
  const can = await viewerFlags("organization.team_members", [
    "read",
    "create",
  ]);
  if (!can.read) return <RolesNoAccess what="Users" />;
  return <TeamMembersPage canAdd={can.create} />;
}
