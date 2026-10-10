import type { Metadata } from "next";

import { HrmsComingSoon } from "@/components/hrms/hrms-coming-soon";
import { HRMS_PATH, hrmsPage } from "@/lib/hrms-nav";

const HREF = `${HRMS_PATH}/configuration/shift-management`;

export const metadata: Metadata = { title: hrmsPage(HREF).title };

/** Shift Management (CM-307); a placeholder until that ticket builds it. */
export default function ShiftManagementPage() {
  return <HrmsComingSoon href={HREF} />;
}
