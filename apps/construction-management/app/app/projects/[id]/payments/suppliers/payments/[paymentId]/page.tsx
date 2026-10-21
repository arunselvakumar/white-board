import type { Metadata } from "next";
import { Suspense } from "react";

import { PartyPaymentDetail } from "@/components/finance/parties/party-payment-detail";
import { PartyPaymentDetailSkeleton } from "@/components/finance/parties/parties-skeletons";

export const metadata: Metadata = { title: "Supplier payment" };

/** One payment to a Supplier, with its receipt, Apply advance and Cancel. */
export default async function SupplierPaymentPage({
  params,
}: {
  params: Promise<{ id: string; paymentId: string }>;
}) {
  const { id, paymentId } = await params;
  return (
    <Suspense
      fallback={
        <PartyPaymentDetailSkeleton projectId={id} partyType="supplier" />
      }
    >
      <PartyPaymentDetail
        projectId={id}
        partyType="supplier"
        paymentId={paymentId}
      />
    </Suspense>
  );
}
