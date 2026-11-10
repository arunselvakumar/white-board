import type { Metadata } from "next";

import { LeaveConfigurationPage } from "@/app/app/hrms/configuration/leave-types/_components/leave-configuration-page";
import { HRMS_PATH, hrmsPage } from "@/lib/hrms-nav";

export const metadata: Metadata = {
  title: hrmsPage(`${HRMS_PATH}/configuration/leave-types`).title,
};

export default function LeaveTypesRoute() {
  return <LeaveConfigurationPage />;
}
