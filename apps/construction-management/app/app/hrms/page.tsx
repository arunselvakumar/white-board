import type { Metadata } from "next";

import { HrmsDashboardPage } from "@/app/app/hrms/_components/hrms-dashboard-page";
import { HRMS_PATH, hrmsPage } from "@/lib/hrms-nav";

export const metadata: Metadata = { title: hrmsPage(HRMS_PATH).title };

export default function HrmsDashboardRoute() {
  return <HrmsDashboardPage />;
}
