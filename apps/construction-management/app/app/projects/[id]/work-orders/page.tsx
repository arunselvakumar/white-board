import type { Metadata } from "next";

import { ContractsComingSoon } from "@/components/contracts/contracts-coming-soon";

export const metadata: Metadata = { title: "Work Orders" };

/** The Project's Work Orders (ADR CM-0023 §5); built in CM-1104. */
export default function WorkOrdersPage() {
  return <ContractsComingSoon module="work_orders" />;
}
