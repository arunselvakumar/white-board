import type { Metadata } from "next";

import { ShiftsPage } from "@/app/app/hrms/configuration/shifts/_components/shifts-page";
import { HRMS_PATH, hrmsPage } from "@/lib/hrms-nav";

const HREF = `${HRMS_PATH}/configuration/shifts`;

export const metadata: Metadata = { title: hrmsPage(HREF).title };

/** Shift templates and rotations. */
export default function ShiftsRoute() {
  return <ShiftsPage />;
}
