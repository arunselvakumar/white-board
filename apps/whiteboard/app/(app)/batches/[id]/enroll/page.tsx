import type { Metadata } from "next";

import { EnrollmentCreateScreen } from "@/components/enrollments/enrollment-create-screen";

export const metadata: Metadata = { title: "Enroll Student" };

export default async function EnrollFromBatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EnrollmentCreateScreen batchId={id} />;
}
