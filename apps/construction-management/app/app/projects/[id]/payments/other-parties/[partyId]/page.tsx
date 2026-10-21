import type { Metadata } from "next";
import { Suspense } from "react";

import { PartyMoneyPage } from "@/components/finance/parties/party-money-page";
import { PartyMoneyPageSkeleton } from "@/components/finance/parties/parties-skeletons";

export const metadata: Metadata = { title: "Other Party" };

/** One Other Party's invoices, payments and statement on a Project. */
export default async function ProjectOtherPartyPage({
  params,
}: {
  params: Promise<{ id: string; partyId: string }>;
}) {
  const { id, partyId } = await params;
  return (
    <Suspense
      fallback={
        <PartyMoneyPageSkeleton projectId={id} partyType="other_party" />
      }
    >
      <PartyMoneyPage
        projectId={id}
        partyType="other_party"
        partyId={partyId}
      />
    </Suspense>
  );
}
