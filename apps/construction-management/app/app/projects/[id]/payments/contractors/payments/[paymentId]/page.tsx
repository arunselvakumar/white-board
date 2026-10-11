import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@repo/ui/components/skeleton";

import { PartyPaymentDetail } from "@/components/finance/parties/party-payment-detail";

export const metadata: Metadata = { title: "Contractor payment" };

/** One payment to a Contractor, with its receipt, Apply advance and Cancel. */
export default async function ContractorPaymentPage({
  params,
}: {
  params: Promise<{ id: string; paymentId: string }>;
}) {
  const { id, paymentId } = await params;
  return (
    <Suspense fallback={<Skeleton className="h-40 w-full" />}>
      <PartyPaymentDetail
        projectId={id}
        partyType="contractor"
        paymentId={paymentId}
      />
    </Suspense>
  );
}
