import type { Metadata } from "next";

import { ContractsComingSoon } from "@/components/contracts/contracts-coming-soon";

export const metadata: Metadata = { title: "Client Bills" };

/** The Project's Client Bills (ADR CM-0023 §7); built in CM-1107. */
export default function ClientBillsPage() {
  return <ContractsComingSoon module="client_bills" />;
}
