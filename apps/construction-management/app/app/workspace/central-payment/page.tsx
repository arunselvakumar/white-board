import type { Metadata } from "next";

import { FinanceComingSoon } from "@/components/finance/finance-coming-soon";

export const metadata: Metadata = { title: "Central Payment" };

/** Workspace → Central Payment (M7). */
export default function CentralPaymentPage() {
  return <FinanceComingSoon title="Central Payment" ticket="CM-709" />;
}
