import type { Metadata } from "next";

import { PartyBalanceWorkspace } from "@/components/finance/parties/party-balance-workspace";

export const metadata: Metadata = { title: "Party Balance" };

/** Workspace → Party Balance: each Other Party's balance across Projects (CM-708). */
export default function PartyBalancePage() {
  return <PartyBalanceWorkspace />;
}
