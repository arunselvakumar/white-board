import type { Metadata } from "next";

import { BatchCreateScreen } from "@/components/batches/batch-create-screen";

export const metadata: Metadata = { title: "Add Batch" };

export default function NewBatchPage() {
  return <BatchCreateScreen />;
}
