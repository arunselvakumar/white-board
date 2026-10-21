import type { Metadata } from "next";

import { ProjectTransferEdit } from "@/components/procurement/transfers/project-transfer-pages";
import { TransferFormSkeleton } from "@/components/procurement/procurement-skeletons";
import { QuerySuspense } from "@/components/query-suspense";

export const metadata: Metadata = { title: "Edit Material Transfer" };

/** Edit a pending Material Transfer (CM-507). */
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
