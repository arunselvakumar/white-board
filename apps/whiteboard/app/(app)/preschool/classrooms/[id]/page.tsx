import type { Metadata } from "next";

import { ClassroomDetailScreen } from "@/app/(app)/preschool/classrooms/[id]/_components/classroom-detail-screen";

export const metadata: Metadata = { title: "Classroom" };

export default async function ClassroomPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ClassroomDetailScreen classroomId={id} />;
}
