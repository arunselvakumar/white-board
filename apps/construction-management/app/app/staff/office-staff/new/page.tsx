import type { Metadata } from "next";

import { AddTeamMember } from "@/app/app/staff/office-staff/new/_components/add-team-member";
import { AddTeamMemberSkeleton } from "@/app/app/staff/office-staff/_components/team-members-skeletons";
import { QuerySuspense } from "@/components/query-suspense";
import { RolesNoAccess } from "@/app/app/staff/_components/roles-no-access";

import { viewerFlags } from "../../../_lib/viewer-can";

export const metadata: Metadata = { title: "Add Staff" };

export default async function Page() {
  const can = await viewerFlags("organization.team_members", [
    "create",
    "financial",
  ]);
  if (!can.create) return <RolesNoAccess what="adding Staff" />;
  return (
    <QuerySuspense fallback={<AddTeamMemberSkeleton />}>
      <AddTeamMember canSeeSalary={can.financial} />
    </QuerySuspense>
  );
}
