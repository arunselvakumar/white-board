import type { Metadata } from "next";

import { PartyMoneyTab } from "@/components/finance/parties/party-money-tab";

export const metadata: Metadata = { title: "Client payments" };

/** The Project's Client: its Client Bill invoices, receipts and settlements (CM-1107). */
export default async function ProjectClientsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PartyMoneyTab projectId={id} partyType="client" />;
}
