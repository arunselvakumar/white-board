import type { Metadata } from "next";

import { PartyMoneyTab } from "@/app/app/projects/[id]/payments/_components/party-money-tab";

export const metadata: Metadata = { title: "Supplier payments" };

/** Supplier balances, invoices (GRNs awaiting one) and payments on a Project. */
export default async function ProjectSuppliersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PartyMoneyTab projectId={id} partyType="supplier" />;
}
