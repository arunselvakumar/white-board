import type { Metadata } from "next";

import { HrmsDashboardPage } from "@/components/hrms/hrms-dashboard-page";
import { HRMS_PATH, hrmsPage } from "@/lib/hrms-nav";

export const metadata: Metadata = { title: hrmsPage(HRMS_PATH).title };

/** HRMS Dashboard (CM-319). */
export default function HrmsDashboardRoute() {
  return <HrmsDashboardPage />;
}
