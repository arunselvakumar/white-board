import type { Metadata } from "next";

import { ShiftManagementPage } from "@/app/app/hrms/configuration/shift-management/_components/shift-management-page";
import { HRMS_PATH, hrmsPage } from "@/lib/hrms-nav";

const HREF = `${HRMS_PATH}/configuration/shift-management`;

export const metadata: Metadata = { title: hrmsPage(HREF).title };

/** Shift assignments, each in force until changed. */
export default function ShiftManagementRoute() {
  return <ShiftManagementPage />;
}
