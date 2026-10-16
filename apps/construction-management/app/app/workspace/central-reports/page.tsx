import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { ProjectNoAccess } from "@/components/projects/files/project-no-access";
import { CentralReportsPage } from "@/components/reports/central-reports-page";

export const metadata: Metadata = { title: "Central Reports" };

/**
 * Workspace → Central Reports (CM-903, ADR CM-0021 §5): the central
 * reports the member may request, across their Projects and the Central
 * Stores (Central Reports Read).
 */
export default async function CentralReportsRoute() {
  if (!(await viewerCan("reporting.central_reports", "read")))
    return <ProjectNoAccess what="Central Reports" />;
  return <CentralReportsPage />;
}
