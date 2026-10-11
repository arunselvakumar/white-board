import type { Metadata } from "next";

import { FinanceComingSoon } from "@/components/finance/finance-coming-soon";

export const metadata: Metadata = { title: "Other Expenses" };

/** Other Expenses of a Project (M7). */
export default function ProjectOtherExpensesPage() {
  return <FinanceComingSoon title="Other Expenses" ticket="CM-704" />;
}
