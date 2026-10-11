import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@repo/ui/components/skeleton";

import { PartyMoneyPage } from "@/components/finance/parties/party-money-page";

export const metadata: Metadata = { title: "Supplier" };

/** One Supplier's invoices, payments and statement on a Project. */
export default async function ProjectSupplierPage({
  params,
}: {
  params: Promise<{ id: string; partyId: string }>;
}) {
  const { id, partyId } = await params;
  return (
    <Suspense fallback={<Skeleton className="h-40 w-full" />}>
      <PartyMoneyPage projectId={id} partyType="supplier" partyId={partyId} />
    </Suspense>
  );
}
