import type { Metadata } from "next";

import { PartyMoneyTab } from "@/components/finance/parties/party-money-tab";

export const metadata: Metadata = { title: "Contractor payments" };

/** Contractor balances, invoices, payments and TDS on a Project (CM-706). */
export default async function ProjectContractorsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PartyMoneyTab projectId={id} partyType="contractor" />;
}
