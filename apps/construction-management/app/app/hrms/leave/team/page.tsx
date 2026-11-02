import type { Metadata } from "next";

import { TeamLeavesPage } from "@/components/hrms/leave/team-leaves-page";
import { HRMS_PATH, hrmsPage } from "@/lib/hrms-nav";

export const metadata: Metadata = {
  title: hrmsPage(`${HRMS_PATH}/leave/team`).title,
};

/** Team Leaves (CM-313). */
export default function TeamLeavesRoute() {
  return <TeamLeavesPage />;
}
