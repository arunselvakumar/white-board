import type { Metadata } from "next";

import { PartyPaymentScreen } from "@/components/finance/parties/party-payment-form";

export const metadata: Metadata = { title: "Pay Supplier" };

/** Record a payment to a Supplier on a Project (CM-0017 §6). */
export default async function PaySupplierPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ partyId?: string }>;
}) {
  const { id } = await params;
  const { partyId } = await searchParams;
  return (
    <PartyPaymentScreen
      projectId={id}
      partyType="supplier"
      partyId={partyId ?? null}
    />
  );
}
