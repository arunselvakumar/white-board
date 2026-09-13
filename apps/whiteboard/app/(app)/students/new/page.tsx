import type { Metadata } from "next";

import { StudentCreateScreen } from "@/components/students/student-create-screen";

export const metadata: Metadata = { title: "Add Student" };

export default function NewStudentPage() {
  return <StudentCreateScreen />;
}
