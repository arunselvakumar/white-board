import type { Metadata } from "next";

import { EditWingScreen } from "@/app/app/projects/[id]/wings/[wingId]/edit/_components/edit-wing-screen";
import { StructureNoAccess } from "@/app/app/projects/[id]/_components/structure/structure-parts";

import { structureAccess } from "../../structure-access";
import { QuerySuspense } from "@/components/query-suspense";
import { EditWingSkeleton } from "@/app/app/projects/[id]/_components/structure/structure-skeletons";

export const metadata: Metadata = { title: "Edit Wing" };

/** Edit Wing: the floor and unit editor on the saved Wing. */
export default async function EditWingRoute({
  params,
}: {
  params: Promise<{ id: string; wingId: string }>;
}) {
  const { id, wingId } = await params;
  const access = await structureAccess("projects.wings", id);
  if (!access.read || !access.update)
    return <StructureNoAccess what="editing Wings" />;
  return (
    <QuerySuspense
      fallback={<EditWingSkeleton projectId={id} wingId={wingId} />}
    >
      <EditWingScreen projectId={id} wingId={wingId} />
    </QuerySuspense>
  );
}
