import type { Metadata } from "next";

import { StudentEditScreen } from "@/app/(app)/students/[id]/edit/_components/student-edit-screen";

export const metadata: Metadata = { title: "Edit Student" };

export default async function EditStudentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <StudentEditScreen studentId={id} />;
}
