import type { Metadata } from "next";

import { ProjectTransferDetail } from "@/components/procurement/transfers/project-transfer-pages";
import { TransferDetailSkeleton } from "@/components/procurement/procurement-skeletons";
import { QuerySuspense } from "@/components/query-suspense";

export const metadata: Metadata = { title: "Material Transfer" };

/** One Material Transfer (CM-507); the route checks Read on either side. */
export default async function ProjectTransferRoute({
  params,
}: {
  params: Promise<{ id: string; transferId: string }>;
}) {
  const { id, transferId } = await params;
  return (
    <QuerySuspense
      fallback={
        <TransferDetailSkeleton
          backHref={`/app/projects/${encodeURIComponent(id)}/materials/transfers`}
        />
      }
    >
      <ProjectTransferDetail projectId={id} transferId={transferId} />
    </QuerySuspense>
  );
}
