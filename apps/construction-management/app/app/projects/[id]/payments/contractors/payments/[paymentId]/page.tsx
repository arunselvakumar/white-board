import type { Metadata } from "next";
import { Suspense } from "react";

import { PartyPaymentDetail } from "@/components/finance/parties/party-payment-detail";
import { PartyPaymentDetailSkeleton } from "@/components/finance/parties/parties-skeletons";

export const metadata: Metadata = { title: "Contractor payment" };

/** One payment to a Contractor, with its receipt, Apply advance and Cancel. */
export default async function ContractorPaymentPage({
  params,
}: {
  params: Promise<{ id: string; paymentId: string }>;
}) {
  const { id, paymentId } = await params;
  return (
    <Suspense
      fallback={
        <PartyPaymentDetailSkeleton projectId={id} partyType="contractor" />
      }
    >
      <PartyPaymentDetail
        projectId={id}
        partyType="contractor"
        paymentId={paymentId}
      />
    </Suspense>
  );
}
