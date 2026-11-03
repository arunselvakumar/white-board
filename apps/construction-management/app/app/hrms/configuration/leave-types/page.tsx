import type { Metadata } from "next";

import { LeaveConfigurationPage } from "@/components/hrms/leave/leave-configuration-page";
import { HRMS_PATH, hrmsPage } from "@/lib/hrms-nav";

export const metadata: Metadata = {
  title: hrmsPage(`${HRMS_PATH}/configuration/leave-types`).title,
};

/** Leave Types & Structures (CM-310, CM-311). */
export default function LeaveTypesRoute() {
  return <LeaveConfigurationPage />;
}
