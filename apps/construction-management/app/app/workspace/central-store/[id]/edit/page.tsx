import type { Metadata } from "next";

import { EditStorePage } from "@/components/procurement/stores/edit-store-page";
import { StoreFormSkeleton } from "@/components/procurement/procurement-skeletons";
import { QuerySuspense } from "@/components/query-suspense";

export const metadata: Metadata = { title: "Edit store" };

export default async function EditStoreRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <QuerySuspense fallback={<StoreFormSkeleton storeId={id} />}>
      <EditStorePage storeId={id} />
    </QuerySuspense>
  );
}
