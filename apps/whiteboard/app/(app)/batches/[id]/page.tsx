import type { Metadata } from "next";

import { BatchEditScreen } from "@/app/(app)/batches/[id]/_components/batch-edit-screen";

export const metadata: Metadata = { title: "Edit Batch" };

export default async function EditBatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <BatchEditScreen batchId={id} />;
}
