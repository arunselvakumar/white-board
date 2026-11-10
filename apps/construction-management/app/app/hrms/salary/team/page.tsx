import type { Metadata } from "next";

import { TeamSalaryPage } from "@/app/app/hrms/salary/team/_components/team-salary-page";
import { HRMS_PATH, hrmsPage } from "@/lib/hrms-nav";

const HREF = `${HRMS_PATH}/salary/team`;

export const metadata: Metadata = { title: hrmsPage(HREF).title };

export default function TeamSalaryRoute() {
  return <TeamSalaryPage />;
}
