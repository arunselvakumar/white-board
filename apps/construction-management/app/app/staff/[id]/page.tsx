import type { Metadata } from "next";

import { EditTeamMember } from "@/components/team-members/edit-team-member";
import { EditTeamMemberSkeleton } from "@/components/team-members/team-members-skeletons";
import { QuerySuspense } from "@/components/query-suspense";
import { RolesNoAccess } from "@/components/roles/roles-no-access";

import { viewerFlags } from "../../_lib/viewer-can";

export const metadata: Metadata = { title: "Edit Staff" };

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const can = await viewerFlags("organization.team_members", [
    "read",
    "financial",
  ]);
  if (!can.read) return <RolesNoAccess what="Staff" />;
  return (
    <QuerySuspense fallback={<EditTeamMemberSkeleton />}>
      <EditTeamMember id={id} canSeeSalary={can.financial} />
    </QuerySuspense>
  );
}
