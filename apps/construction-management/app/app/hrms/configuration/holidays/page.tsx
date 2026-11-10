import type { Metadata } from "next";

import { HolidaysPage } from "@/app/app/hrms/configuration/holidays/_components/holidays-page";
import { HRMS_PATH, hrmsPage } from "@/lib/hrms-nav";

const HREF = `${HRMS_PATH}/configuration/holidays`;

export const metadata: Metadata = { title: hrmsPage(HREF).title };

/** Configuration → Holidays (CM-305). */
export default function HolidaysRoute() {
  return <HolidaysPage />;
}
