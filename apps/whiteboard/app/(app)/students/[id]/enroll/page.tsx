import type { Metadata } from "next";

import { EnrollmentCreateScreen } from "@/app/(app)/_components/enrollments/enrollment-create-screen";

export const metadata: Metadata = { title: "Enroll Student" };

export default async function EnrollStudentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EnrollmentCreateScreen studentId={id} />;
}
