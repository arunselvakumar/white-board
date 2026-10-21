import type { Metadata } from "next";

import { StructureNoAccess } from "@/components/projects/structure/structure-parts";
import { WingChartScreen } from "@/components/projects/structure/wing-chart";

import { structureAccess } from "../structure-access";
import { QuerySuspense } from "@/components/query-suspense";
import { WingChartSkeleton } from "@/components/projects/structure/structure-skeletons";

export const metadata: Metadata = { title: "Wing" };

/** One Wing's chart: floors × units (CM-402). */
export default async function WingRoute({
  params,
}: {
  params: Promise<{ id: string; wingId: string }>;
}) {
  const { id, wingId } = await params;
  const access = await structureAccess("projects.wings", id);
  if (!access.read) return <StructureNoAccess what="Wings" />;
  return (
    <QuerySuspense fallback={<WingChartSkeleton projectId={id} />}>
      <WingChartScreen projectId={id} wingId={wingId} access={access} />
    </QuerySuspense>
  );
}
