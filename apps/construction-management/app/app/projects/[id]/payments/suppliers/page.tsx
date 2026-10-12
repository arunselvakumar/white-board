import type { Metadata } from "next";

import { FinanceComingSoon } from "@/components/finance/finance-coming-soon";

export const metadata: Metadata = { title: "Supplier payments" };

/** Supplier payments of a Project (M7). */
export default function ProjectSuppliersPage() {
  return <FinanceComingSoon title="Supplier payments" ticket="CM-705" />;
}
