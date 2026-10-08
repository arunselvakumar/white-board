import type { Metadata } from "next";

import { BatchTestsScreen } from "@/components/class-tests/staff/batch-tests-screen";

export const metadata: Metadata = { title: "Tests" };

export default async function TeacherBatchTestsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <BatchTestsScreen batchId={id} basePath={`/teacher/batches/${id}/tests`} />
  );
}
