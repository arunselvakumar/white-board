import type { Metadata } from "next";

import { EditTeamMember } from "@/components/team-members/edit-team-member";
import { EditTeamMemberSkeleton } from "@/components/team-members/team-members-skeletons";
import { QuerySuspense } from "@/components/query-suspense";
import { RolesNoAccess } from "@/components/roles/roles-no-access";

import { viewerCan } from "../../_lib/viewer-can";

export const metadata: Metadata = { title: "Edit User" };

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!(await viewerCan("organization.team_members", "read")))
    return <RolesNoAccess what="Users" />;
  return (
    <QuerySuspense fallback={<EditTeamMemberSkeleton />}>
      <EditTeamMember id={id} />
    </QuerySuspense>
  );
}
