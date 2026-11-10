import type { Metadata } from "next";

import { CourseCreateScreen } from "@/app/(app)/courses/new/_components/course-create-screen";

export const metadata: Metadata = { title: "Add Course" };

export default function NewCoursePage() {
  return <CourseCreateScreen />;
}
