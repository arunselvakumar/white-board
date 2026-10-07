import { getAuth } from "@repo/auth/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { FamilyHomeScreen } from "@/components/home/family-home-screen";

export const metadata: Metadata = { title: "Student Home" };

export default async function StudentPage() {
  const { role } = await getAuth();
  if (role !== "student") redirect("/");
  return <FamilyHomeScreen role="student" />;
}
