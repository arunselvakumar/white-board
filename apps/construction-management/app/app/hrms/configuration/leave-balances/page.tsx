import type { Metadata } from "next";

import { LeaveBalancesPage } from "@/components/hrms/leave/leave-balances-page";
import { HRMS_PATH, hrmsPage } from "@/lib/hrms-nav";

export const metadata: Metadata = {
  title: hrmsPage(`${HRMS_PATH}/configuration/leave-balances`).title,
};

/** Leave Balances (CM-311). */
export default function LeaveBalancesRoute() {
  return <LeaveBalancesPage />;
}
