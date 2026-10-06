import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { FamilyHomeScreen } from "@/components/home/family-home-screen";

export const metadata: Metadata = { title: "Parent Home" };

export default async function ParentPage() {
  const { orgRole } = await auth();
  if (orgRole !== "org:parent") redirect("/");
  return <FamilyHomeScreen role="org:parent" />;
}
