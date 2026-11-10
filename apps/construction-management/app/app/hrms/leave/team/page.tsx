import type { Metadata } from "next";

import { TeamLeavesPage } from "@/app/app/hrms/leave/team/_components/team-leaves-page";
import { HRMS_PATH, hrmsPage } from "@/lib/hrms-nav";

export const metadata: Metadata = {
  title: hrmsPage(`${HRMS_PATH}/leave/team`).title,
};

export default function TeamLeavesRoute() {
  return <TeamLeavesPage />;
}
