import type { Metadata } from "next";

import { PartyPaymentScreen } from "@/components/finance/parties/party-payment-form";

export const metadata: Metadata = { title: "Client receipt" };

/** Record a Payment In from the Project's Client, with the TDS and GST-TDS it deducted (CM-1107). */
export default async function ClientReceiptFormPage({
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
      partyType="client"
      partyId={partyId ?? null}
      direction="in"
    />
  );
}
