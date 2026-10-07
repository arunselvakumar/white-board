import { getAuth } from "@repo/auth/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { FamilyHomeworkScreen } from "@/components/class-work/family/family-homework-screen";

export const metadata: Metadata = { title: "Homework" };

export default async function ParentHomeworkPage() {
  const { role } = await getAuth();
  if (role !== "parent") redirect("/");
  return <FamilyHomeworkScreen role="parent" />;
}
