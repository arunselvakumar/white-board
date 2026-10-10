import type { Metadata } from "next";

import { LeaveApprovalsPage } from "@/components/hrms/leave/leave-approvals-page";
import { HRMS_PATH, hrmsPage } from "@/lib/hrms-nav";

export const metadata: Metadata = {
  title: hrmsPage(`${HRMS_PATH}/leave/approvals`).title,
};

/** Leave Approvals (CM-313). */
export default function LeaveApprovalsRoute() {
  return <LeaveApprovalsPage />;
}
