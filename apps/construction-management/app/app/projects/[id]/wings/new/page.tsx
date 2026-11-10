import type { Metadata } from "next";

import { AddWingScreen } from "@/app/app/projects/[id]/wings/new/_components/add-wing-screen";
import { StructureNoAccess } from "@/app/app/projects/[id]/_components/structure/structure-parts";

import { structureAccess } from "../structure-access";
import { QuerySuspense } from "@/components/query-suspense";
import { AddWingSkeleton } from "@/app/app/projects/[id]/_components/structure/structure-skeletons";

export const metadata: Metadata = { title: "Add Wing" };

/** Add Wing: details, then Continue to Units, then Save. */
export default async function AddWingRoute({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ phase?: string | string[] }>;
}) {
  const { id } = await params;
  const { phase } = await searchParams;
  const access = await structureAccess("projects.wings", id);
  if (!access.read || !access.create)
    return <StructureNoAccess what="adding Wings" />;
  return (
    <QuerySuspense fallback={<AddWingSkeleton projectId={id} />}>
      <AddWingScreen
        projectId={id}
        phaseId={typeof phase === "string" ? phase : undefined}
      />
    </QuerySuspense>
  );
}
