import type { Metadata } from "next";

import { LeaveBalancesPage } from "@/app/app/hrms/configuration/leave-balances/_components/leave-balances-page";
import { HRMS_PATH, hrmsPage } from "@/lib/hrms-nav";

export const metadata: Metadata = {
  title: hrmsPage(`${HRMS_PATH}/configuration/leave-balances`).title,
};

export default function LeaveBalancesRoute() {
  return <LeaveBalancesPage />;
}
