import type { Metadata } from "next";

import { CourseEditScreen } from "@/components/courses/course-edit-screen";

export const metadata: Metadata = { title: "Edit Course" };

export default async function EditCoursePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CourseEditScreen courseId={id} />;
}
