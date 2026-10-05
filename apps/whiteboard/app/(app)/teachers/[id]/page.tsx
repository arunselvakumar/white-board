import type { Metadata } from "next";
import { TeacherDetailScreen } from "@/components/teachers/teacher-detail-screen";
export const metadata: Metadata = { title: "Teacher" };
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <TeacherDetailScreen id={(await params).id} />;
}
