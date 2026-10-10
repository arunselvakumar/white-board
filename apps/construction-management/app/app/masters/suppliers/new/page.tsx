import type { Metadata } from "next";

import { NewPartyScreen } from "@/components/parties/party-form";

export const metadata: Metadata = { title: "Add Supplier" };

export default function NewSupplierPage() {
  return <NewPartyScreen list="suppliers" />;
}
