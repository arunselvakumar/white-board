import type { Metadata } from "next";

import { HomeworkSubmissionsScreen } from "@/components/class-work/staff/homework-submissions-screen";

export const metadata: Metadata = { title: "Submissions" };

export default async function TeacherHomeworkSubmissionsPage({
  params,
}: {
  params: Promise<{ id: string; homeworkId: string }>;
}) {
  const { id, homeworkId } = await params;
  return (
    <HomeworkSubmissionsScreen
      homeworkId={homeworkId}
      basePath={`/teacher/batches/${id}/homework`}
    />
  );
}
