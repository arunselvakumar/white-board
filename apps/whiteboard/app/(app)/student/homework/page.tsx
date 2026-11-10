import { getAuth } from "@repo/auth/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { FamilyHomeworkScreen } from "@/app/(app)/_components/class-work/family/family-homework-screen";

export const metadata: Metadata = { title: "Homework" };

export default async function StudentHomeworkPage() {
  const { role } = await getAuth();
  if (role !== "student") redirect("/");
  return <FamilyHomeworkScreen role="student" />;
}
