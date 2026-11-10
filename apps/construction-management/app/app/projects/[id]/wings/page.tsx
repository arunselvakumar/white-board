import type { Metadata } from "next";

import { StructureNoAccess } from "@/app/app/projects/[id]/_components/structure/structure-parts";
import { WingsPage } from "@/app/app/projects/[id]/wings/_components/wings-page";

import { structureAccess } from "./structure-access";
import { QuerySuspense } from "@/components/query-suspense";
import { WingsSkeleton } from "@/app/app/projects/[id]/_components/structure/structure-skeletons";

export const metadata: Metadata = { title: "Wings" };

/** The Project's Wings by Phase. */
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
