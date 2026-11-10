import type { Metadata } from "next";

import { PartiesPage } from "@/app/app/masters/_components/parties/parties-page";

export const metadata: Metadata = { title: "Suppliers" };

export default function SuppliersMasterPage() {
  return <PartiesPage list="suppliers" />;
}
