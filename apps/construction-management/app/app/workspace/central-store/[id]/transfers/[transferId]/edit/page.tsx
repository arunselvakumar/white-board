import type { Metadata } from "next";

import { StoreTransferEdit } from "@/app/app/workspace/central-store/[id]/transfers/_components/store-transfer-pages";
import { TransferFormSkeleton } from "@/app/app/_components/procurement/procurement-skeletons";
import { QuerySuspense } from "@/components/query-suspense";

export const metadata: Metadata = { title: "Edit Material Transfer" };

export default async function StoreTransferEditRoute({
  params,
}: {
  params: Promise<{ id: string; transferId: string }>;
}) {
  const { id, transferId } = await params;
  return (
    <div className="w-full max-w-4xl p-6">
      <QuerySuspense fallback={<TransferFormSkeleton />}>
        <StoreTransferEdit storeId={id} transferId={transferId} />
      </QuerySuspense>
    </div>
  );
}
