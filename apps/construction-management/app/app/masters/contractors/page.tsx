import type { Metadata } from "next";

import { PartiesPage } from "@/components/parties/parties-page";

export const metadata: Metadata = { title: "Contractors" };

export default function ContractorsMasterPage() {
  return <PartiesPage list="contractors" />;
}
