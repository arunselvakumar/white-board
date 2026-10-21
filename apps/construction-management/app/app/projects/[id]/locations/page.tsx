import type { Metadata } from "next";

import { LocationsPage } from "@/components/projects/structure/locations-page";
import { StructureNoAccess } from "@/components/projects/structure/structure-parts";

import { structureAccess } from "../wings/structure-access";
import { QuerySuspense } from "@/components/query-suspense";
import { LocationsSkeleton } from "@/components/projects/structure/structure-skeletons";

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
