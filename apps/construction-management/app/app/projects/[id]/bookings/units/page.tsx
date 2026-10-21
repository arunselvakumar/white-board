import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { ProjectNoAccess } from "@/components/projects/files/project-no-access";
import { UnitsTab } from "@/components/sales/units/units-tab";
import { QuerySuspense } from "@/components/query-suspense";
import { UnitsTabSkeleton } from "@/components/sales/units/units-skeletons";

export const metadata: Metadata = { title: "Units" };

/** Bookings → Units: the Project's units by sales status (CM-1005). */
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
