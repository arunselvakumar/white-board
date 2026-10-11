import type { Metadata } from "next";

import { FinanceComingSoon } from "@/components/finance/finance-coming-soon";

export const metadata: Metadata = { title: "Company's Bank A/C" };

/** Masters → Company's Bank A/C (M7). */
export default function BankAccountsPage() {
  return <FinanceComingSoon title="Company's Bank A/C" ticket="CM-701" />;
}
