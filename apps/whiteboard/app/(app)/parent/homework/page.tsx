import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { FamilyHomeworkScreen } from "@/components/class-work/family/family-homework-screen";

export const metadata: Metadata = { title: "Homework" };

export default async function ParentHomeworkPage() {
  const { orgRole } = await auth();
  if (orgRole !== "org:parent") redirect("/");
  return <FamilyHomeworkScreen role="org:parent" />;
}
