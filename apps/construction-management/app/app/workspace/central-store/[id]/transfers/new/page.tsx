import type { Metadata } from "next";

import { StoreTransferNew } from "@/components/procurement/transfers/store-transfer-pages";

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
      <StoreTransferNew storeId={id} />
    </div>
  );
}
