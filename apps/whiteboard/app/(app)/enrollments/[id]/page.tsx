import type { Metadata } from "next";

import { EnrollmentDetailScreen } from "@/components/enrollments/enrollment-detail-screen";

export const metadata: Metadata = { title: "Enrollment" };

export default async function EnrollmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EnrollmentDetailScreen enrollmentId={id} />;
}
