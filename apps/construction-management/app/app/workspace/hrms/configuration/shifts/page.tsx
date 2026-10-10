import type { Metadata } from "next";

import { HrmsComingSoon } from "@/components/hrms/hrms-coming-soon";
import { HRMS_PATH, hrmsPage } from "@/lib/hrms-nav";

const HREF = `${HRMS_PATH}/configuration/shifts`;

export const metadata: Metadata = { title: hrmsPage(HREF).title };

/** Shifts (CM-306); a placeholder until that ticket builds it. */
export default function ShiftsPage() {
  return <HrmsComingSoon href={HREF} />;
}
