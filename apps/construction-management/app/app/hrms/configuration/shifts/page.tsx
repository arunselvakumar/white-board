import type { Metadata } from "next";

import { ShiftsPage } from "@/components/hrms/shifts-page";
import { HRMS_PATH, hrmsPage } from "@/lib/hrms-nav";

const HREF = `${HRMS_PATH}/configuration/shifts`;

export const metadata: Metadata = { title: hrmsPage(HREF).title };

/** Configuration → Shifts: shift templates and rotations (CM-306). */
export default function ShiftsRoute() {
  return <ShiftsPage />;
}
