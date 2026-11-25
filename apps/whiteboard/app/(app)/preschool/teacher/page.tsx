import type { Metadata } from "next";

import { TeacherHomeScreen } from "@/app/(app)/preschool/teacher/_components/teacher-home-screen";

export const metadata: Metadata = { title: "Teacher Home" };

export default function TeacherHomePage() {
  return <TeacherHomeScreen />;
}
