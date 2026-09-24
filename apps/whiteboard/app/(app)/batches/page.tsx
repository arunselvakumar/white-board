import type { Metadata } from "next";

import { BatchesScreen } from "@/components/batches/batches-screen";

export const metadata: Metadata = { title: "Batches" };

export default function BatchesPage() {
  return <BatchesScreen />;
}
