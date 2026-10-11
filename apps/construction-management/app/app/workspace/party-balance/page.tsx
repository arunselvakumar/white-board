import type { Metadata } from "next";

import { FinanceComingSoon } from "@/components/finance/finance-coming-soon";

export const metadata: Metadata = { title: "Party Balance" };

/** Workspace → Party Balance (M7). */
export default function PartyBalancePage() {
  return <FinanceComingSoon title="Party Balance" ticket="CM-708" />;
}
