import { getAuth } from "@repo/auth/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { FamilyHomeScreen } from "@/components/home/family-home-screen";

export const metadata: Metadata = { title: "Parent Home" };

export default async function ParentPage() {
  const { role } = await getAuth();
  if (role !== "parent") redirect("/");
  return <FamilyHomeScreen role="parent" />;
}
