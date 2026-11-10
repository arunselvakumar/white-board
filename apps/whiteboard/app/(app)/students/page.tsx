import type { Metadata } from "next";

import { StudentsScreen } from "@/app/(app)/students/_components/students-screen";

export const metadata: Metadata = { title: "Students" };

export default function StudentsPage() {
  return <StudentsScreen />;
}
