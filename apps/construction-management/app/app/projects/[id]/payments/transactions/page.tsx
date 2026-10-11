import type { Metadata } from "next";

import { FinanceComingSoon } from "@/components/finance/finance-coming-soon";

export const metadata: Metadata = { title: "Transactions" };

/** Transactions of a Project (M7). */
export default function ProjectTransactionsPage() {
  return <FinanceComingSoon title="Transactions" ticket="CM-702" />;
}
