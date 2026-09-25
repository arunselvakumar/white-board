import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { OwnerDashboardScreen } from "@/components/dashboard/owner-dashboard-screen";

export async function generateMetadata(): Promise<Metadata> {
  const { orgRole } = await auth();
  return {
    title: orgRole === "org:student"
      ? "Student"
      : orgRole === "org:parent"
        ? "Parent"
        : "Owner Dashboard",
  };
}

export default async function HomePage() {
  const { orgId, orgRole } = await auth();
  if (orgId == null) return null;
  if (orgRole === "org:student") return <main className="p-6">Hello world</main>;
  if (orgRole === "org:parent") return <main className="p-6">Hello world</main>;
  if (orgRole !== "org:admin") notFound();
  return <OwnerDashboardScreen />;
}
