import type { Metadata } from "next";

import { ProjectTransferDetail } from "@/app/app/projects/[id]/materials/transfers/_components/project-transfer-pages";
import { TransferDetailSkeleton } from "@/app/app/_components/procurement/procurement-skeletons";
import { QuerySuspense } from "@/components/query-suspense";
import { pageHref } from "@/lib/page-href";

export const metadata: Metadata = { title: "Material Transfer" };

/** One Material Transfer; the route checks Read on either side. */
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
          backHref={pageHref("/app/projects/[id]/materials/transfers", { id })}
        />
      }
    >
      <ProjectTransferDetail projectId={id} transferId={transferId} />
    </QuerySuspense>
  );
}
