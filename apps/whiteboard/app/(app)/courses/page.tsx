import type { Metadata } from "next";

import { CoursesScreen } from "@/app/(app)/courses/_components/courses-screen";

export const metadata: Metadata = { title: "Courses" };

export default function CoursesPage() {
  return <CoursesScreen />;
}
