import type { Metadata } from "next";

import { TeamMembersPage } from "@/components/team-members/team-members-page";

export const metadata: Metadata = { title: "Team Members" };

export default function Page() {
  return <TeamMembersPage />;
}
