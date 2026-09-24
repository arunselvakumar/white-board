import type { Metadata } from "next";

import { StudentProfileScreen } from "@/components/students/student-profile-view";

export const metadata: Metadata = { title: "View Student" };

export default async function ViewStudentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <StudentProfileScreen studentId={id} />;
}
