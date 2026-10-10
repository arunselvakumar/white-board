import type { Metadata } from "next";

import { HrmsComingSoon } from "@/components/hrms/hrms-coming-soon";
import { HRMS_PATH, hrmsPage } from "@/lib/hrms-nav";

const HREF = `${HRMS_PATH}/configuration/branches`;

export const metadata: Metadata = { title: hrmsPage(HREF).title };

/** Branches & Sites (CM-304); a placeholder until that ticket builds it. */
export default function BranchesPage() {
  return <HrmsComingSoon href={HREF} />;
}
