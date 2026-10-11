import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@repo/ui/components/skeleton";

import { PartyMoneyPage } from "@/components/finance/parties/party-money-page";

export const metadata: Metadata = { title: "Other Party" };

/** One Other Party's invoices, payments and statement on a Project. */
export default async function ProjectOtherPartyPage({
  params,
}: {
  params: Promise<{ id: string; partyId: string }>;
}) {
  const { id, partyId } = await params;
  return (
    <Suspense fallback={<Skeleton className="h-40 w-full" />}>
      <PartyMoneyPage
        projectId={id}
        partyType="other_party"
        partyId={partyId}
      />
    </Suspense>
  );
}
