import type { Metadata } from "next";

import { PartyPaymentScreen } from "@/components/finance/parties/party-payment-form";

export const metadata: Metadata = { title: "Other Party payment" };

/** Record a Payment Out to, or a Payment In from, an Other Party (CM-708). */
export default async function OtherPartyPaymentFormPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ partyId?: string; direction?: string }>;
}) {
  const { id } = await params;
  const { partyId, direction } = await searchParams;
  return (
    <PartyPaymentScreen
      projectId={id}
      partyType="other_party"
      partyId={partyId ?? null}
      direction={direction === "in" ? "in" : "out"}
    />
  );
}
