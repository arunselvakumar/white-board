import type { Metadata } from "next";

import { StudentTestHistoryScreen } from "@/app/(app)/teacher/batches/[id]/students/[studentId]/_components/student-test-history-screen";

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
