import type { Metadata } from "next";

import { HrmsComingSoon } from "@/components/hrms/hrms-coming-soon";
import { HRMS_PATH, hrmsPage } from "@/lib/hrms-nav";

const HREF = `${HRMS_PATH}/configuration/leave-balances`;

export const metadata: Metadata = { title: hrmsPage(HREF).title };

/** Leave Balances (CM-311); a placeholder until that ticket builds it. */
export default function LeaveBalancesPage() {
  return <HrmsComingSoon href={HREF} />;
}
