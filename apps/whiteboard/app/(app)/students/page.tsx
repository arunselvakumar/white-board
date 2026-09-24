import type { Metadata } from "next";

import { StudentsScreen } from "@/components/students/students-screen";

export const metadata: Metadata = { title: "Students" };

export default function StudentsPage() {
  return <StudentsScreen />;
}
