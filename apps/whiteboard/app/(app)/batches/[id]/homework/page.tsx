import type { Metadata } from "next";

import { BatchClassWorkScreen } from "@/components/class-work/staff/batch-class-work-screen";

export const metadata: Metadata = { title: "Homework and Study Material" };

export default async function BatchHomeworkPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <BatchClassWorkScreen batchId={id} basePath={`/batches/${id}/homework`} />
  );
}
