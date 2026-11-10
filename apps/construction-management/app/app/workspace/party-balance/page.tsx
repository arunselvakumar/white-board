import type { Metadata } from "next";

import { PartyBalanceWorkspace } from "@/app/app/workspace/party-balance/_components/party-balance-workspace";

export const metadata: Metadata = { title: "Party Balance" };

/** Each Other Party's balance across Projects. */
export default function PartyBalancePage() {
  return <PartyBalanceWorkspace />;
}
