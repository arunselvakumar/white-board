import type { Metadata } from "next";

import { PartyMoneyTab } from "@/components/finance/parties/party-money-tab";

export const metadata: Metadata = { title: "Other Party payments" };

/** Other Party balances, purchase and sales invoices, payments and settlements on a Project (CM-708). */
export default async function ProjectOtherPartiesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PartyMoneyTab projectId={id} partyType="other_party" />;
}
