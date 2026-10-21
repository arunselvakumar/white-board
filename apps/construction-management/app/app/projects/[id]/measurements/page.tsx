import type { Metadata } from "next";

import { ContractsComingSoon } from "@/components/contracts/contracts-coming-soon";

export const metadata: Metadata = { title: "Measurements" };

/** The Project's Measurements (ADR CM-0023 §6); built in CM-1105. */
export default function MeasurementsPage() {
  return <ContractsComingSoon module="measurements" />;
}
