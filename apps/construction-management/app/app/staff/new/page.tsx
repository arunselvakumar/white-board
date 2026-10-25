import type { Metadata } from "next";

import { AddTeamMemberWizard } from "@/components/team-members/add-team-member-wizard";
import { AddTeamMemberSkeleton } from "@/components/team-members/team-members-skeletons";
import { QuerySuspense } from "@/components/query-suspense";
import { RolesNoAccess } from "@/components/roles/roles-no-access";

import { viewerFlags } from "../../_lib/viewer-can";

export const metadata: Metadata = { title: "Add Staff" };

export default async function Page() {
  const can = await viewerFlags("organization.team_members", [
    "create",
    "financial",
  ]);
  if (!can.create) return <RolesNoAccess what="adding Staff" />;
  return (
    <QuerySuspense fallback={<AddTeamMemberSkeleton />}>
      <AddTeamMemberWizard canSeeSalary={can.financial} />
    </QuerySuspense>
  );
}
