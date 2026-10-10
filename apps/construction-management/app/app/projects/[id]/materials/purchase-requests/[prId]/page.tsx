import type { Metadata } from "next";

import { QuerySuspense } from "@/components/query-suspense";
import { PurchaseRequestDetailPage } from "@/components/procurement/purchase-requests/purchase-request-detail";

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
    <QuerySuspense>
      <PurchaseRequestDetailPage
        projectId={id}
        id={prId}
        uploadFailed={typeof uploadFailed === "string" ? Number(uploadFailed) || 0 : 0}
      />
    </QuerySuspense>
  );
}
