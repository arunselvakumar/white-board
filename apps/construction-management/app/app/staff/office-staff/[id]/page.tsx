import type { Metadata } from "next";

import { EditTeamMember } from "@/app/app/staff/office-staff/[id]/_components/edit-team-member";
import { EditTeamMemberSkeleton } from "@/app/app/staff/office-staff/_components/team-members-skeletons";
import { QuerySuspense } from "@/components/query-suspense";
import { RolesNoAccess } from "@/app/app/staff/_components/roles-no-access";

import { viewerCan, viewerFlags } from "../../../_lib/viewer-can";

export const metadata: Metadata = { title: "Edit Staff" };

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [can, canSeeAttendance] = await Promise.all([
    viewerFlags("organization.team_members", ["read", "financial"]),
    // The Attendance tab needs HRMS Attendance Read too (ADR CM-0051 §5).
    viewerCan("hrms.attendance", "read"),
  ]);
  if (!can.read) return <RolesNoAccess what="Office Staff" />;
  return (
    <QuerySuspense fallback={<EditTeamMemberSkeleton />}>
      <EditTeamMember
        id={id}
        canSeeSalary={can.financial}
        canSeeAttendance={canSeeAttendance}
      />
    </QuerySuspense>
  );
}
