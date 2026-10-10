import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { ProjectTransfersList } from "@/components/procurement/transfers/project-transfer-pages";
import { ProjectNoAccess } from "@/components/projects/files/project-no-access";

export const metadata: Metadata = { title: "Material Transfers" };

/** The Project's Material Transfers, both directions (CM-507). */
export default async function ProjectTransfersRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (
    !(await viewerCan("procurement.material_transfers", "read", {
      projectId: id,
    }))
  )
    return <ProjectNoAccess what="Material Transfers" />;
  return <ProjectTransfersList projectId={id} />;
}
