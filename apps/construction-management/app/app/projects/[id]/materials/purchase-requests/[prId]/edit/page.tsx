import type { Metadata } from "next";

import { QuerySuspense } from "@/components/query-suspense";
import { EditPurchaseRequest } from "@/app/app/projects/[id]/materials/purchase-requests/[prId]/edit/_components/edit-purchase-request";
import {
  EditDocumentSkeleton,
  PurchaseRequestWizardSkeleton,
} from "@/app/app/_components/procurement/procurement-skeletons";

export const metadata: Metadata = { title: "Edit Purchase Request" };

export default async function Page({
  params,
}: {
  params: Promise<{ id: string; prId: string }>;
}) {
  const { id, prId } = await params;
  return (
    <QuerySuspense
      fallback={
        <EditDocumentSkeleton>
          <PurchaseRequestWizardSkeleton />
        </EditDocumentSkeleton>
      }
    >
      <EditPurchaseRequest projectId={id} id={prId} />
    </QuerySuspense>
  );
}
