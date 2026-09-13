import type { Metadata } from "next";

import { CourseCreateScreen } from "@/components/courses/course-create-screen";

export const metadata: Metadata = { title: "Add Course" };

export default function NewCoursePage() {
  return <CourseCreateScreen />;
}
