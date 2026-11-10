import type { Metadata } from "next";

import { PartiesPage } from "@/app/app/masters/_components/parties/parties-page";

export const metadata: Metadata = { title: "Contractors" };

export default function ContractorsMasterPage() {
  return <PartiesPage list="contractors" />;
}
