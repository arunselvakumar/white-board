import type { Metadata } from "next";

import { HrmsComingSoon } from "@/components/hrms/hrms-coming-soon";
import { HRMS_PATH, hrmsPage } from "@/lib/hrms-nav";

const HREF = `${HRMS_PATH}/leave/approvals`;

export const metadata: Metadata = { title: hrmsPage(HREF).title };

/** Leave Approvals (CM-313); a placeholder until that ticket builds it. */
export default function LeaveApprovalsPage() {
  return <HrmsComingSoon href={HREF} />;
}
