import type { Metadata } from "next";

import { StoreDetailPage } from "@/components/procurement/stores/store-detail-page";
import { StoreDetailSkeleton } from "@/components/procurement/procurement-skeletons";
import { QuerySuspense } from "@/components/query-suspense";

export const metadata: Metadata = { title: "Store" };

/** One Central Store: stock, Projects, Material Requests, Delivery Notes. */
export default async function StoreRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <QuerySuspense fallback={<StoreDetailSkeleton />}>
      <StoreDetailPage storeId={id} />
    </QuerySuspense>
  );
}
