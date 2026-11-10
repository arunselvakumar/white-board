import type { Metadata } from "next";

import { BatchesScreen } from "@/app/(app)/batches/_components/batches-screen";

export const metadata: Metadata = { title: "Batches" };

export default function BatchesPage() {
  return <BatchesScreen />;
}
