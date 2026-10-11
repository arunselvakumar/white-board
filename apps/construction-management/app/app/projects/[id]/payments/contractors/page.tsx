import type { Metadata } from "next";

import { FinanceComingSoon } from "@/components/finance/finance-coming-soon";

export const metadata: Metadata = { title: "Contractor payments" };

/** Contractor payments of a Project (M7). */
export default function ProjectContractorsPage() {
  return <FinanceComingSoon title="Contractor payments" ticket="CM-706" />;
}
