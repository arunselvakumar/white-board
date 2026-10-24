import type { Metadata } from "next";

import { AddTeamMemberWizard } from "@/components/team-members/add-team-member-wizard";
import { AddTeamMemberSkeleton } from "@/components/team-members/team-members-skeletons";
import { QuerySuspense } from "@/components/query-suspense";
import { RolesNoAccess } from "@/components/roles/roles-no-access";

import { viewerCan } from "../../_lib/viewer-can";

export const metadata: Metadata = { title: "Add User" };

export default async function Page() {
  if (!(await viewerCan("organization.team_members", "create")))
    return <RolesNoAccess what="adding Users" />;
  return (
    <QuerySuspense fallback={<AddTeamMemberSkeleton />}>
      <AddTeamMemberWizard />
    </QuerySuspense>
  );
}
