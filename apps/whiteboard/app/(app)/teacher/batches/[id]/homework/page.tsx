import type { Metadata } from "next";

import { BatchClassWorkScreen } from "@/components/class-work/staff/batch-class-work-screen";

export const metadata: Metadata = { title: "Homework and Study Material" };

export default async function TeacherBatchHomeworkPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <BatchClassWorkScreen
      batchId={id}
      basePath={`/teacher/batches/${id}/homework`}
    />
  );
}
