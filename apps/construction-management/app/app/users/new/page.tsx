import type { Metadata } from "next";

import { AddTeamMemberWizard } from "@/components/team-members/add-team-member-wizard";
import { AddTeamMemberSkeleton } from "@/components/team-members/team-members-skeletons";
import { QuerySuspense } from "@/components/query-suspense";

export const metadata: Metadata = { title: "Add User" };

export default function Page() {
  return (
    <QuerySuspense fallback={<AddTeamMemberSkeleton />}>
      <AddTeamMemberWizard />
    </QuerySuspense>
  );
}
