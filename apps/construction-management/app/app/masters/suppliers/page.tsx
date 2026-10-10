import type { Metadata } from "next";

import { PartiesPage } from "@/components/parties/parties-page";

export const metadata: Metadata = { title: "Suppliers" };

export default function SuppliersMasterPage() {
  return <PartiesPage list="suppliers" />;
}
