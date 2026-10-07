import { getAuth } from "@repo/auth/server";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { redirect } from "next/navigation";

import { OwnerDashboardScreen } from "@/components/dashboard/owner-dashboard-screen";

export async function generateMetadata(): Promise<Metadata> {
  const { role } = await getAuth();
  return {
    title:
      role === "student"
        ? "Student Home"
        : role === "parent"
          ? "Parent Home"
          : role === "teacher"
            ? "My Batches"
            : "Owner Dashboard",
  };
}

export default async function HomePage() {
  const { workspaceId, role } = await getAuth();
  if (workspaceId == null) return null;
  if (role === "student") redirect("/student");
  if (role === "parent") redirect("/parent");
  if (role === "teacher") redirect("/teacher");
  if (role !== "owner") notFound();
  return <OwnerDashboardScreen />;
}
