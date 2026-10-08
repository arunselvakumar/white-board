import type { Metadata } from "next";

import { EditTeamMember } from "@/components/team-members/edit-team-member";

export const metadata: Metadata = { title: "Edit Team Member" };

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EditTeamMember id={id} />;
}
