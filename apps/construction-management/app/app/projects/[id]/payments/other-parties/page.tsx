import type { Metadata } from "next";

import { FinanceComingSoon } from "@/components/finance/finance-coming-soon";

export const metadata: Metadata = { title: "Other Party payments" };

/** Other Party payments of a Project (M7). */
export default function ProjectOtherPartiesPage() {
  return <FinanceComingSoon title="Other Party payments" ticket="CM-708" />;
}
