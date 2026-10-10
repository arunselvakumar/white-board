import type { Metadata } from "next";

import { BranchesPage } from "@/components/hrms/branches-page";
import { HRMS_PATH, hrmsPage } from "@/lib/hrms-nav";

const HREF = `${HRMS_PATH}/configuration/branches`;

export const metadata: Metadata = { title: hrmsPage(HREF).title };

/** Configuration → Branches & Sites (CM-304). */
export default function BranchesRoute() {
  return <BranchesPage />;
}
