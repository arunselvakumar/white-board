import type { Metadata } from "next";

import { AddTeamMemberWizard } from "@/components/team-members/add-team-member-wizard";

export const metadata: Metadata = { title: "Add Team Member" };

export default function Page() {
  return <AddTeamMemberWizard />;
}
