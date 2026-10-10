import type { Metadata } from "next";

import { HrmsComingSoon } from "@/components/hrms/hrms-coming-soon";
import { HRMS_PATH, hrmsPage } from "@/lib/hrms-nav";

const HREF = `${HRMS_PATH}/configuration/holidays`;

export const metadata: Metadata = { title: hrmsPage(HREF).title };

/** Holidays (CM-305); a placeholder until that ticket builds it. */
export default function HolidaysPage() {
  return <HrmsComingSoon href={HREF} />;
}
