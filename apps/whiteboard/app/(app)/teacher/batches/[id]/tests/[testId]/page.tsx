import type { Metadata } from "next";

import { TestDetailScreen } from "@/components/class-tests/staff/test-detail-screen";

export const metadata: Metadata = { title: "Test" };

export default async function TeacherBatchTestPage({
  params,
}: {
  params: Promise<{ id: string; testId: string }>;
}) {
  const { id, testId } = await params;
  return (
    <TestDetailScreen
      testId={testId}
      testsPath={`/teacher/batches/${id}/tests`}
      studentBasePath={`/teacher/batches/${id}/students`}
    />
  );
}
