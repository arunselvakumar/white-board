import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { ProjectNoAccess } from "@/app/app/_components/projects/files/project-no-access";
import { CentralReportsPage } from "@/components/reports/central-reports-page";

export const metadata: Metadata = { title: "Central Reports" };

/**
 * The central reports the member may request, across their Projects and the
 * Central Stores (ADR CM-0021 §5). Needs Central Reports Read.
 */
export default async function CentralReportsRoute() {
  if (!(await viewerCan("reporting.central_reports", "read")))
    return <ProjectNoAccess what="Central Reports" />;
  return <CentralReportsPage />;
}
