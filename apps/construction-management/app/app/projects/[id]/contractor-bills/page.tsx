import type { Metadata } from "next";

import { ContractsComingSoon } from "@/components/contracts/contracts-coming-soon";

export const metadata: Metadata = { title: "Contractor Bills" };

/** The Project's Contractor Bills (ADR CM-0023 §7); built in CM-1106. */
export default function ContractorBillsPage() {
  return <ContractsComingSoon module="contractor_bills" />;
}
