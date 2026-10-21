import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { ProjectNoAccess } from "@/components/projects/files/project-no-access";
import { ProjectEquipmentDetailPage } from "@/components/site-work/equipment/equipment-pages";
import { EquipmentDetailSkeleton } from "@/components/site-work/site-work-skeletons";
import { QuerySuspense } from "@/components/query-suspense";

export const metadata: Metadata = { title: "Equipment" };

export default async function ProjectEquipmentDetailRoute({
  params,
}: {
  params: Promise<{ id: string; equipmentId: string }>;
}) {
  const { id, equipmentId } = await params;
  if (
    !(await viewerCan("site_work.equipment_usage", "read", {
      projectId: id,
    })) &&
    !(await viewerCan("masters.equipments", "read"))
  )
    return <ProjectNoAccess what="Equipment" />;
  return (
    <QuerySuspense
      fallback={
        <EquipmentDetailSkeleton
          back={{
            label: "Equipment",
            href: `/app/projects/${encodeURIComponent(id)}/equipment/register`,
          }}
        />
      }
    >
      <ProjectEquipmentDetailPage projectId={id} id={equipmentId} />
    </QuerySuspense>
  );
}
