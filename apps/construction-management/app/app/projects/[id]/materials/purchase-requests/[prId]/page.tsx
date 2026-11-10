import type { Metadata } from "next";

import { QuerySuspense } from "@/components/query-suspense";
import { PurchaseRequestDetailPage } from "@/app/app/projects/[id]/materials/purchase-requests/[prId]/_components/purchase-request-detail";
import { PurchaseRequestDetailSkeleton } from "@/app/app/_components/procurement/procurement-skeletons";

export const metadata: Metadata = { title: "Purchase Request" };

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; prId: string }>;
  searchParams: Promise<{ uploadFailed?: string | string[] }>;
}) {
  const { id, prId } = await params;
  const { uploadFailed } = await searchParams;
  return (
    <QuerySuspense fallback={<PurchaseRequestDetailSkeleton projectId={id} />}>
      <PurchaseRequestDetailPage
        projectId={id}
        id={prId}
        uploadFailed={
          typeof uploadFailed === "string" ? Number(uploadFailed) || 0 : 0
        }
      />
    </QuerySuspense>
  );
}
