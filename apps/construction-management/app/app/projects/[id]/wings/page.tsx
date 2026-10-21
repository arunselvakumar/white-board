import type { Metadata } from "next";

import { StructureNoAccess } from "@/components/projects/structure/structure-parts";
import { WingsPage } from "@/components/projects/structure/wings-page";

import { structureAccess } from "./structure-access";
import { QuerySuspense } from "@/components/query-suspense";
import { WingsSkeleton } from "@/components/projects/structure/structure-skeletons";

export const metadata: Metadata = { title: "Wings" };

/** The Project's Wings by Phase (CM-402). */
export default async function ProjectWingsRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const access = await structureAccess("projects.wings", id);
  if (!access.read) return <StructureNoAccess what="Wings" />;
  return (
    <QuerySuspense fallback={<WingsSkeleton />}>
      <WingsPage projectId={id} access={access} />
    </QuerySuspense>
  );
}
