import type { Metadata } from "next";

import { LocationsPage } from "@/app/app/projects/[id]/locations/_components/locations-page";
import { StructureNoAccess } from "@/app/app/projects/[id]/_components/structure/structure-parts";

import { structureAccess } from "../wings/structure-access";
import { QuerySuspense } from "@/components/query-suspense";
import { LocationsSkeleton } from "@/app/app/projects/[id]/_components/structure/structure-skeletons";

export const metadata: Metadata = { title: "Locations" };

/** The Project's Locations (CM-405). */
export default async function ProjectLocationsRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const access = await structureAccess("projects.locations", id);
  if (!access.read) return <StructureNoAccess what="Locations" />;
  return (
    <QuerySuspense fallback={<LocationsSkeleton />}>
      <LocationsPage projectId={id} access={access} />
    </QuerySuspense>
  );
}
