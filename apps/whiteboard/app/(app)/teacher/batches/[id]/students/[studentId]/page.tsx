import type { Metadata } from "next";

import { StudentTestHistoryScreen } from "@/components/class-tests/history/student-test-history-screen";

export const metadata: Metadata = { title: "Test history" };

export default async function TeacherStudentTestsPage({
  params,
}: {
  params: Promise<{ id: string; studentId: string }>;
}) {
  const { id, studentId } = await params;
  return (
    <StudentTestHistoryScreen
      studentId={studentId}
      testsBasePath="/teacher/batches"
      backHref={`/teacher/batches/${id}/tests`}
    />
  );
}
