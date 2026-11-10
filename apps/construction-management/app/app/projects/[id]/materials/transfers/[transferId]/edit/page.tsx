import type { Metadata } from "next";

import { ProjectTransferEdit } from "@/app/app/projects/[id]/materials/transfers/_components/project-transfer-pages";
import { TransferFormSkeleton } from "@/app/app/_components/procurement/procurement-skeletons";
import { QuerySuspense } from "@/components/query-suspense";

export const metadata: Metadata = { title: "Edit Material Transfer" };

/** Edit a pending Material Transfer. */
export default async function ProjectTransferEditRoute({
  params,
}: {
  params: Promise<{ id: string; transferId: string }>;
}) {
  const { id, transferId } = await params;
  return (
    <QuerySuspense fallback={<TransferFormSkeleton />}>
      <ProjectTransferEdit projectId={id} transferId={transferId} />
    </QuerySuspense>
  );
}
