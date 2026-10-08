import { getAuth } from "@repo/auth/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { FamilyResultsScreen } from "@/components/class-tests/family/family-results-screen";

export const metadata: Metadata = { title: "Results" };

export default async function ParentResultsPage() {
  const { role } = await getAuth();
  if (role !== "parent") redirect("/");
  return <FamilyResultsScreen role="parent" />;
}
