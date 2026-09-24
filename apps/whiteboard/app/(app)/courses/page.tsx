import type { Metadata } from "next";

import { CoursesScreen } from "@/components/courses/courses-screen";

export const metadata: Metadata = { title: "Courses" };

export default function CoursesPage() {
  return <CoursesScreen />;
}
