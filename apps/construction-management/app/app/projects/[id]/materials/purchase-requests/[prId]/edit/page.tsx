import type { Metadata } from "next";

import { QuerySuspense } from "@/components/query-suspense";
import { EditPurchaseRequest } from "@/components/procurement/purchase-requests/edit-purchase-request";

export const metadata: Metadata = { title: "Edit Purchase Request" };

export default async function Page({ params }: { params: Promise<{ id: string; prId: string }> }) {
  const { id, prId } = await params;
  return (
    <QuerySuspense>
      <EditPurchaseRequest projectId={id} id={prId} />
    </QuerySuspense>
  );
}
