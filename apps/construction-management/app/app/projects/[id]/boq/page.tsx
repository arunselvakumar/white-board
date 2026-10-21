import type { Metadata } from "next";

import { ContractsComingSoon } from "@/components/contracts/contracts-coming-soon";

export const metadata: Metadata = { title: "BOQ" };

/** The Project's BOQ (ADR CM-0023 §4); built in CM-1103. */
export default function BoqPage() {
  return <ContractsComingSoon module="boq" />;
}
