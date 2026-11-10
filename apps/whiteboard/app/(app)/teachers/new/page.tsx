import type { Metadata } from "next";
import { TeacherCreateScreen } from "@/app/(app)/teachers/new/_components/teacher-create-screen";
export const metadata: Metadata = { title: "Add Teacher" };
export default function Page() {
  return <TeacherCreateScreen />;
}
