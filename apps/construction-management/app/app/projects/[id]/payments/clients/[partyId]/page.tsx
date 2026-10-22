import type { Metadata } from "next";
import { Suspense } from "react";

import { PartyMoneyPage } from "@/components/finance/parties/party-money-page";
import { PartyMoneyPageSkeleton } from "@/components/finance/parties/parties-skeletons";

export const metadata: Metadata = { title: "Client" };

/** The Client's invoices, receipts, statement and receivables on a Project (CM-1107). */
export default async function ProjectClientPage({
  params,
}: {
  params: Promise<{ id: string; partyId: string }>;
}) {
  const { id, partyId } = await params;
  return (
    <Suspense
      fallback={<PartyMoneyPageSkeleton projectId={id} partyType="client" />}
    >
      <PartyMoneyPage projectId={id} partyType="client" partyId={partyId} />
    </Suspense>
  );
}
