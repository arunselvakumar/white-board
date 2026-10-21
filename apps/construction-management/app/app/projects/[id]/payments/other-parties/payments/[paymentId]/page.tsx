import type { Metadata } from "next";
import { Suspense } from "react";

import { PartyPaymentDetail } from "@/components/finance/parties/party-payment-detail";
import { PartyPaymentDetailSkeleton } from "@/components/finance/parties/parties-skeletons";

export const metadata: Metadata = { title: "Other Party payment" };

/** One payment to or from an Other Party, with its receipt, Apply advance and Cancel. */
export default async function OtherPartyPaymentPage({
  params,
}: {
  params: Promise<{ id: string; paymentId: string }>;
}) {
  const { id, paymentId } = await params;
  return (
    <Suspense
      fallback={
        <PartyPaymentDetailSkeleton projectId={id} partyType="other_party" />
      }
    >
      <PartyPaymentDetail
        projectId={id}
        partyType="other_party"
        paymentId={paymentId}
      />
    </Suspense>
  );
}
