import type { Metadata } from "next";
import { Suspense } from "react";

import { PartyPaymentDetail } from "@/components/finance/parties/party-payment-detail";
import { PartyPaymentDetailSkeleton } from "@/components/finance/parties/parties-skeletons";

export const metadata: Metadata = { title: "Client receipt" };

/** One receipt from the Client, with its receipt PDF, Apply advance and Cancel (CM-1107). */
export default async function ClientPaymentPage({
  params,
}: {
  params: Promise<{ id: string; paymentId: string }>;
}) {
  const { id, paymentId } = await params;
  return (
    <Suspense
      fallback={
        <PartyPaymentDetailSkeleton projectId={id} partyType="client" />
      }
    >
      <PartyPaymentDetail
        projectId={id}
        partyType="client"
        paymentId={paymentId}
      />
    </Suspense>
  );
}
