import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { HomeworkDetailScreen } from "@/components/class-work/family/homework-detail-screen";

export const metadata: Metadata = { title: "Homework" };

export default async function StudentHomeworkDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ homeworkId: string }>;
  searchParams: Promise<{ student?: string | string[] }>;
}) {
  const { orgRole } = await auth();
  if (orgRole !== "org:student") redirect("/");
  const [{ homeworkId }, { student }] = await Promise.all([
    params,
    searchParams,
  ]);
  const studentId = Array.isArray(student) ? student[0] : student;
  return (
    <HomeworkDetailScreen
      role="org:student"
      homeworkId={homeworkId}
      studentId={studentId ?? null}
    />
  );
}
