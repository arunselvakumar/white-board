import type { Metadata } from "next";

import { BatchCreateScreen } from "@/app/(app)/batches/new/_components/batch-create-screen";

export const metadata: Metadata = { title: "Add Batch" };

export default function NewBatchPage() {
  return <BatchCreateScreen />;
}
