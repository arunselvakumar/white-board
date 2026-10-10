import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { StockRegisterPage } from "@/components/procurement/inventory/stock-register-page";
import { ProjectNoAccess } from "@/components/projects/files/project-no-access";

export const metadata: Metadata = { title: "Stock Register" };

/** The Project's Stock Register for a date range (CM-506). */
export default async function ProjectStockRegisterRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (
    !(await viewerCan("procurement.current_inventory", "report", {
      projectId: id,
    }))
  )
    return <ProjectNoAccess what="the Stock Register" />;
  return <StockRegisterPage location={{ kind: "project", id }} />;
}
