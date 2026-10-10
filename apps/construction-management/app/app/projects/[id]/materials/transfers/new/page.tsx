import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { ProjectTransferNew } from "@/components/procurement/transfers/project-transfer-pages";
import { ProjectNoAccess } from "@/components/projects/files/project-no-access";

export const metadata: Metadata = { title: "New Material Transfer" };

/** New Material Transfer from the Project; `?materials=` starts its lines (CM-507). */
export default async function ProjectTransferNewRoute({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ materials?: string | string[] }>;
}) {
  const { id } = await params;
  const { materials } = await searchParams;
  if (
    !(await viewerCan("procurement.material_transfers", "create", {
      projectId: id,
    }))
  )
    return <ProjectNoAccess what="new Material Transfers" />;
  const materialIds = (
    Array.isArray(materials) ? materials.join(",") : (materials ?? "")
  )
    .split(",")
    .map((value) => value.trim())
    .filter((value) => /^[0-9a-f-]{36}$/i.test(value))
    .slice(0, 100);
  return <ProjectTransferNew projectId={id} materialIds={materialIds} />;
}
