import type { Metadata } from "next";

import { RolesNoAccess } from "@/app/app/staff/_components/roles-no-access";
import { TeamMembersPage } from "@/app/app/staff/office-staff/_components/team-members-page";

import { viewerFlags } from "../../_lib/viewer-can";

export const metadata: Metadata = { title: "Office Staff" };

export default async function Page() {
  const can = await viewerFlags("organization.team_members", [
    "read",
    "create",
  ]);
  if (!can.read) return <RolesNoAccess what="Office Staff" />;
  return <TeamMembersPage canAdd={can.create} />;
}
