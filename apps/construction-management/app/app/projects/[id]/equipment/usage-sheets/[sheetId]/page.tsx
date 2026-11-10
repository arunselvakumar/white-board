import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { QuerySuspense } from "@/components/query-suspense";
import { ProjectNoAccess } from "@/app/app/_components/projects/files/project-no-access";
import { EquipmentSheetDetailPage } from "@/app/app/projects/[id]/equipment/usage-sheets/[sheetId]/_components/equipment-sheet-detail";
import { EquipmentSheetDetailSkeleton } from "@/app/app/_components/site-work/site-work-skeletons";

export const metadata: Metadata = { title: "Equipment Usage sheet" };

export default async function EquipmentSheetRoute({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; sheetId: string }>;
  searchParams: Promise<{ uploadFailed?: string | string[] }>;
}) {
  const { id, sheetId } = await params;
  const { uploadFailed } = await searchParams;
  const failed =
    typeof uploadFailed === "string"
      ? uploadFailed
          .split("\n")
          .map((name) => name.trim())
          .filter((name) => name !== "")
          .slice(0, 20)
      : [];
  if (
    !(await viewerCan("site_work.equipment_usage", "read", { projectId: id }))
  )
    return <ProjectNoAccess what="Equipment Usage sheets" />;
  return (
    <QuerySuspense fallback={<EquipmentSheetDetailSkeleton projectId={id} />}>
      <EquipmentSheetDetailPage
        projectId={id}
        id={sheetId}
        uploadFailed={failed}
      />
    </QuerySuspense>
  );
}
