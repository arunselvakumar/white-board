import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { ProjectNoAccess } from "@/app/app/_components/projects/files/project-no-access";
import { UnitsTab } from "@/app/app/projects/[id]/bookings/units/_components/units-tab";
import { QuerySuspense } from "@/components/query-suspense";
import { UnitsTabSkeleton } from "@/app/app/projects/[id]/bookings/units/_components/units-skeletons";

export const metadata: Metadata = { title: "Units" };

/** The Project's units by sales status. */
export default async function UnitsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!(await viewerCan("sales.bookings", "read", { projectId: id })))
    return <ProjectNoAccess what="Bookings" />;
  return (
    <QuerySuspense fallback={<UnitsTabSkeleton />}>
      <UnitsTab projectId={id} />
    </QuerySuspense>
  );
}
