import type { Metadata } from "next";

import { PartyMoneyTab } from "@/components/finance/parties/party-money-tab";

export const metadata: Metadata = { title: "Supplier payments" };

/** Supplier balances, invoices (GRNs awaiting one) and payments on a Project (CM-705). */
export default async function ProjectSuppliersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PartyMoneyTab projectId={id} partyType="supplier" />;
}
