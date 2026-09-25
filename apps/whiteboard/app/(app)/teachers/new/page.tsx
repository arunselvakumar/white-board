import type { Metadata } from "next";
import { TeacherCreateScreen } from "@/components/teachers/teacher-create-screen";
export const metadata: Metadata = { title: "Add Teacher" };
export default function Page() { return <TeacherCreateScreen />; }
