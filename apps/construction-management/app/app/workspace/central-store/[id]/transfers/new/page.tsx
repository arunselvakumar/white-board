import type { Metadata } from "next";

import { StoreTransferNew } from "@/components/procurement/transfers/store-transfer-pages";
import { TransferFormSkeleton } from "@/components/procurement/procurement-skeletons";
import { QuerySuspense } from "@/components/query-suspense";

export const metadata: Metadata = { title: "New Material Transfer" };

/** New Material Transfer from a Central Store (CM-507). */
export default async function StoreTransferNewRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="w-full max-w-4xl p-6">
      <QuerySuspense
        fallback={<TransferFormSkeleton title="New Material Transfer" />}
      >
        <StoreTransferNew storeId={id} />
      </QuerySuspense>
    </div>
  );
}
