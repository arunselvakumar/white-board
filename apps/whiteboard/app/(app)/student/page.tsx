import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { FamilyHomeScreen } from "@/components/home/family-home-screen";

export const metadata: Metadata = { title: "Student Home" };

export default async function StudentPage() {
  const { orgRole } = await auth();
  if (orgRole !== "org:student") redirect("/");
  return <FamilyHomeScreen role="org:student" />;
}
