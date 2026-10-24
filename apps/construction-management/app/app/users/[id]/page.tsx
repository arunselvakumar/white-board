import type { Metadata } from "next";

import { EditTeamMember } from "@/components/team-members/edit-team-member";
import { EditTeamMemberSkeleton } from "@/components/team-members/team-members-skeletons";
import { QuerySuspense } from "@/components/query-suspense";

export const metadata: Metadata = { title: "Edit User" };

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <QuerySuspense fallback={<EditTeamMemberSkeleton />}>
      <EditTeamMember id={id} />
    </QuerySuspense>
  );
}
