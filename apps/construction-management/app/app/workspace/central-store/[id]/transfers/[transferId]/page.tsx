import type { Metadata } from "next";

import { StoreTransferDetail } from "@/components/procurement/transfers/store-transfer-pages";

export const metadata: Metadata = { title: "Material Transfer" };

/** One Material Transfer seen from a Central Store (CM-507). */
export default async function StoreTransferRoute({
  params,
}: {
  params: Promise<{ id: string; transferId: string }>;
}) {
  const { id, transferId } = await params;
  return (
    <div className="w-full max-w-6xl p-6">
      <StoreTransferDetail storeId={id} transferId={transferId} />
    </div>
  );
}
