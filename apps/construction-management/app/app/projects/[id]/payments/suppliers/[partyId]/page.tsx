import type { Metadata } from "next";
import { Suspense } from "react";

import { PartyMoneyPage } from "@/app/app/projects/[id]/payments/_components/party-money-page";
import { PartyMoneyPageSkeleton } from "@/app/app/_components/finance/parties/parties-skeletons";

export const metadata: Metadata = { title: "Supplier" };

/** One Supplier's invoices, payments and statement on a Project. */
export default async function ProjectSupplierPage({
  params,
}: {
  params: Promise<{ id: string; partyId: string }>;
}) {
  const { id, partyId } = await params;
  return (
    <Suspense
      fallback={<PartyMoneyPageSkeleton projectId={id} partyType="supplier" />}
    >
      <PartyMoneyPage projectId={id} partyType="supplier" partyId={partyId} />
    </Suspense>
  );
}
