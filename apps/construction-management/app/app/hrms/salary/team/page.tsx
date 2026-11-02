import type { Metadata } from "next";

import { TeamSalaryPage } from "@/components/hrms/salary/team-salary-page";
import { HRMS_PATH, hrmsPage } from "@/lib/hrms-nav";

const HREF = `${HRMS_PATH}/salary/team`;

export const metadata: Metadata = { title: hrmsPage(HREF).title };

/** Team Salary (CM-317). */
export default function TeamSalaryRoute() {
  return <TeamSalaryPage />;
}
