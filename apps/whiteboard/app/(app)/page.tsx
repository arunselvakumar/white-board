import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { redirect } from "next/navigation";

import { OwnerDashboardScreen } from "@/components/dashboard/owner-dashboard-screen";

export async function generateMetadata(): Promise<Metadata> {
  const { orgRole } = await auth();
  return {
    title:
      orgRole === "org:student"
        ? "Student Home"
        : orgRole === "org:parent"
          ? "Parent Home"
          : orgRole === "org:teacher"
            ? "My Batches"
            : "Owner Dashboard",
  };
}

export default async function HomePage() {
  const { orgId, orgRole } = await auth();
  if (orgId == null) return null;
  if (orgRole === "org:student") redirect("/student");
  if (orgRole === "org:parent") redirect("/parent");
  if (orgRole === "org:teacher") redirect("/teacher");
  if (orgRole !== "org:admin") notFound();
  return <OwnerDashboardScreen />;
}
