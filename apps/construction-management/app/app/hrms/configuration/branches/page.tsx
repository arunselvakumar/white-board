import type { Metadata } from "next";

import { BranchesPage } from "@/app/app/hrms/configuration/branches/_components/branches-page";
import { HRMS_PATH, hrmsPage } from "@/lib/hrms-nav";

const HREF = `${HRMS_PATH}/configuration/branches`;

export const metadata: Metadata = { title: hrmsPage(HREF).title };

export default function BranchesRoute() {
  return <BranchesPage />;
}
