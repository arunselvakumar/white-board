import { getAuth } from "@repo/auth/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { NotificationsScreen } from "@/components/notifications/notifications-screen";

export const metadata: Metadata = { title: "Notifications" };

// Only Teachers receive Notifications in this release (ADR-0041 §1).
export default async function NotificationsPage() {
  const { role } = await getAuth();
  if (role !== "teacher") redirect("/");
  return <NotificationsScreen />;
}
