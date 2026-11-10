import type { Metadata } from "next";

import { ShiftManagementPage } from "@/app/app/hrms/configuration/shift-management/_components/shift-management-page";
import { HRMS_PATH, hrmsPage } from "@/lib/hrms-nav";

const HREF = `${HRMS_PATH}/configuration/shift-management`;

export const metadata: Metadata = { title: hrmsPage(HREF).title };

/** Configuration → Shift Management: assignments until changed (CM-307). */
export default function ShiftManagementRoute() {
  return <ShiftManagementPage />;
}
