import type { Metadata } from "next";

import { FinanceComingSoon } from "@/components/finance/finance-coming-soon";

export const metadata: Metadata = { title: "Other Parties" };

/** Masters → Other Parties (M7). */
export default function OtherPartiesPage() {
  return <FinanceComingSoon title="Other Parties" ticket="CM-704" />;
}
