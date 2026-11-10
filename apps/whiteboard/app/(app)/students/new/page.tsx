import type { Metadata } from "next";

import { StudentCreateScreen } from "@/app/(app)/students/new/_components/student-create-screen";

export const metadata: Metadata = { title: "Add Student" };

export default function NewStudentPage() {
  return <StudentCreateScreen />;
}
