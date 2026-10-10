import type { Metadata } from "next";

import { NewPartyScreen } from "@/components/parties/party-form";

export const metadata: Metadata = { title: "Add Contractor" };

export default function NewContractorPage() {
  return <NewPartyScreen list="contractors" />;
}
