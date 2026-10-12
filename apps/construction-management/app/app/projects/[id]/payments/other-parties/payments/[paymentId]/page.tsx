import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@repo/ui/components/skeleton";

import { PartyPaymentDetail } from "@/components/finance/parties/party-payment-detail";

export const metadata: Metadata = { title: "Other Party payment" };

/** One payment to or from an Other Party, with its receipt, Apply advance and Cancel. */
export default async function OtherPartyPaymentPage({
  params,
}: {
  params: Promise<{ id: string; paymentId: string }>;
}) {
  const { id, paymentId } = await params;
  return (
    <Suspense fallback={<Skeleton className="h-40 w-full" />}>
      <PartyPaymentDetail
        projectId={id}
        partyType="other_party"
        paymentId={paymentId}
      />
    </Suspense>
  );
}
